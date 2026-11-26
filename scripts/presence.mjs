import { io } from 'socket.io-client';

const BASE = 'http://localhost:8080';
const GRACE_MS = Number(process.argv[2] ?? 45000);
const RUN = Date.now().toString(36);
const ROOM_NAME = `presence-${Date.now()}`;

const QUIZ_YAML = `quiz:
  title: "Présence"
questions:
  - title: "Q1 choix"
    points: 1
    answer:
      mode: choice
      options:
        - text: "A"
          correct: true
        - text: "B"
  - title: "Q2 choix"
    points: 1
    answer:
      mode: choice
      options:
        - text: "A"
          correct: true
        - text: "B"
`;

const ok = (label) => console.log(`✅ ${label}`);
const ko = (label, detail) => {
    console.log(`❌ ${label}`, detail ?? '');
    process.exitCode = 1;
};
const check = (cond, label, detail) => (cond ? ok(label) : ko(label, detail));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { method = 'GET', body, token } = {}) {
    const res = await fetch(`${BASE}/api${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
}

async function getAccount(pseudo) {
    const email = `${pseudo}@test.local`;
    const reg = await api('/auth/register', {
        method: 'POST',
        body: { pseudo, email, password: 'secret123' },
    });
    if (reg.status === 201 || reg.status === 200) return reg.json;
    const login = await api('/auth/login', {
        method: 'POST',
        body: { email, password: 'secret123' },
    });
    return login.json;
}

function connect(token) {
    const socket = io(BASE, { transports: ['websocket'], auth: { token } });
    const snapshots = [];
    const events = { hostStatus: [], ended: [] };
    socket.on('game:snapshot', (s) => snapshots.push(s));
    socket.on('game:host-status', (p) => events.hostStatus.push(p));
    socket.on('game:ended', (p) => events.ended.push(p));
    socket.on('connect_error', (err) => console.log('connect_error :', err.message));
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout connexion socket')), 5000);
        socket.on('connect', () => { clearTimeout(t); resolve({ socket, snapshots, events }); });
    });
}

function emit(client, event, payload) {
    return new Promise((resolve) => {
        const t = setTimeout(() => resolve({ timeout: true }), 3000);
        client.socket.emit(event, payload, (res) => { clearTimeout(t); resolve(res); });
    });
}

async function main() {
    let O;
    let A;
    let B;
    try {
        const owner = await getAccount(`owner${RUN}`);
        const alice = await getAccount(`alice${RUN}`);
        const bob = await getAccount(`bob${RUN}`);
        check(!!owner.token && !!alice.token && !!bob.token, 'comptes prêts');

        const created = await api('/rooms', {
            method: 'POST',
            token: owner.token,
            body: { name: ROOM_NAME, nbMaxParticipants: 5, quizYaml: QUIZ_YAML },
        });
        const roomId = created.json.id;
        check(!!roomId, 'salle créée', created.json);

        O = await connect(owner.token);
        A = await connect(alice.token);
        B = await connect(bob.token);
        O.socket.emit('room:join', { roomId });
        A.socket.emit('room:join', { roomId });
        B.socket.emit('room:join', { roomId });
        await wait(300);

        const started = await emit(O, 'room:start', { roomId });
        check(started?.ok === true, 'démarrage par owner accepté', started);

        const answer = await emit(A, 'room:answer', { roomId, value: ['A'] });
        check(answer?.accepted === true, 'réponse d’Alice acceptée', answer);

        O.socket.disconnect();
        await wait(300);
        const disconnectedStatusIndex = A.events.hostStatus.findIndex((event) => event.connected === false);
        check(disconnectedStatusIndex !== -1, 'Alice reçoit game:host-status connected: false', A.events.hostStatus);

        O = await connect(owner.token);
        O.socket.emit('room:join', { roomId });
        await wait(300);
        check(
            disconnectedStatusIndex !== -1
                && A.events.hostStatus.slice(disconnectedStatusIndex + 1).some((event) => event.connected === true),
            'Alice reçoit game:host-status connected: true après la reconnexion',
            A.events.hostStatus,
        );

        O.socket.disconnect();
        await wait(GRACE_MS + 1000);

        check(A.events.ended.length === 1, 'Alice reçoit exactement un game:ended', A.events.ended);
        const room = await api(`/rooms/${roomId}`);
        check(room.status === 200, 'la salle existe toujours en base après la fin', room);
        check(room.json.state === 'FINISHED', 'Room.state vaut FINISHED en base', room.json);
    } finally {
        [O, A, B].filter(Boolean).forEach((client) => client.socket.disconnect());
    }
}

main().catch((err) => {
    console.error('Erreur du scénario :', err);
    process.exit(1);
});
