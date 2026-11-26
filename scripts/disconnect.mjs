import { io } from 'socket.io-client';

const BASE = 'http://localhost:8080';
const RUN = Date.now().toString(36);
const ROOM_NAME = `disconnect-${RUN}`;

const QUIZ_YAML = `quiz:
  title: "Déconnexion"
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

let passed = 0;

const ok = (label) => {
    passed += 1;
    console.log(`✅ ${label}`);
};
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
        await wait(300);

        const answer1 = await emit(A, 'room:answer', { roomId, value: ['A'] });
        check(answer1?.accepted === true, 'réponse d’Alice à la question 1 acceptée', answer1);
        const activeBeforeDisconnect = A.snapshots.at(-1);
        check(
            activeBeforeDisconnect?.state === 'question_active',
            'Alice voit encore question_active avant le départ de Bob',
            activeBeforeDisconnect,
        );
        const bobBeforeDisconnect = activeBeforeDisconnect?.players?.find((p) => p.id === String(bob.user.id));
        check(
            bobBeforeDisconnect?.connected === true
                && !activeBeforeDisconnect?.currentQuestionAnswers?.some((answer) => answer.playerId === String(bob.user.id)),
            'Bob est connecté et n’a pas répondu avant sa déconnexion',
            activeBeforeDisconnect,
        );

        B.socket.disconnect();
        await wait(500);
        const lockedByDisconnect = A.snapshots.at(-1);
        check(
            lockedByDisconnect?.state === 'question_locked',
            'le départ de Bob verrouille la question 1',
            lockedByDisconnect,
        );
        const bobAfterDisconnect = lockedByDisconnect?.players?.find((p) => p.id === String(bob.user.id));
        check(!!bobAfterDisconnect, 'Bob reste dans les joueurs du snapshot', lockedByDisconnect);
        if (bobAfterDisconnect && Object.hasOwn(bobAfterDisconnect, 'connected')) {
            check(bobAfterDisconnect.connected === false, 'Bob est marqué déconnecté dans le snapshot', bobAfterDisconnect);
        } else {
            console.log('⏭️ Contrôle du statut connecté ignoré : champ absent du snapshot.');
        }

        const roomAfterDisconnect = await api(`/rooms/${roomId}`);
        check(roomAfterDisconnect.status === 200, 'GET salle renvoie 200 après la déconnexion de Bob', roomAfterDisconnect);
        check(
            roomAfterDisconnect.json.nbParticipants === 3,
            'Bob n’a pas été retiré de la base : 3 participants (owner, Alice, Bob)',
            roomAfterDisconnect.json,
        );

        const corrected1 = await emit(O, 'room:correct', { roomId });
        check(corrected1?.ok === true, 'correction de la question 1 acceptée', corrected1);
        const next2 = await emit(O, 'room:next', { roomId });
        check(next2?.ok === true, 'passage à la question 2 accepté', next2);
        await wait(300);

        const activeQuestion2 = A.snapshots.at(-1);
        check(activeQuestion2?.state === 'question_active', 'question 2 active', activeQuestion2);
        const aliceOnQuestion2 = activeQuestion2?.players?.find((p) => p.id === String(alice.user.id));
        const bobOnQuestion2 = activeQuestion2?.players?.find((p) => p.id === String(bob.user.id));
        check(
            bobOnQuestion2?.connected === false
                && aliceOnQuestion2?.connected === true
                && activeQuestion2?.currentQuestionAnswers?.length === 0,
            'Bob est déconnecté et les valeurs de réponse sont masquées pendant la question 2',
            activeQuestion2,
        );

        const answer2 = await emit(A, 'room:answer', { roomId, value: ['A'] });
        check(answer2?.accepted === true, 'réponse d’Alice à la question 2 acceptée', answer2);
        await wait(300);
        check(
            A.snapshots.at(-1)?.state === 'question_locked',
            'la question 2 se verrouille sans compter Bob déconnecté',
            A.snapshots.at(-1),
        );

        const corrected2 = await emit(O, 'room:correct', { roomId });
        check(corrected2?.ok === true, 'correction de la question 2 acceptée', corrected2);
        await wait(200);
        const ownerSnapshotCount = O.snapshots.length;
        A.socket.disconnect();
        await wait(500);
        check(
            O.snapshots.length > ownerSnapshotCount && O.snapshots.at(-1)?.state === 'correction',
            'après le départ d’Alice, l’owner reçoit encore un snapshot',
            O.snapshots.at(-1),
        );
        const nextAfterDisconnect = await emit(O, 'room:next', { roomId });
        check(nextAfterDisconnect?.ok === true, 'room:next reste accepté après le départ de tous les joueurs', nextAfterDisconnect);
    } finally {
        [O, A, B].filter(Boolean).forEach((client) => client.socket.disconnect());
        console.log(`Résumé : ${passed} contrôles réussis.`);
    }
}

main().catch((err) => {
    console.error('Erreur du scénario :', err);
    process.exit(1);
});
