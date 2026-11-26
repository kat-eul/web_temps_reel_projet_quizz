import { io } from 'socket.io-client';

const BASE = 'http://localhost:8080';
const RUN = Date.now().toString(36);
const ROOM_NAME = `scenario-${RUN}`;

const QUIZ_YAML = `quiz:
  title: "Scénario"
questions:
  - title: "Q1 choix"
    points: 1
    answer:
      mode: choice
      options:
        - text: "A"
          correct: true
        - text: "B"
  - title: "Q2 texte manuel"
    points: 1
    answer:
      mode: text
      correction: manual
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

    const O = await connect(owner.token);
    const A = await connect(alice.token);
    let B = await connect(bob.token);
    O.socket.emit('room:join', { roomId });
    A.socket.emit('room:join', { roomId });
    B.socket.emit('room:join', { roomId });
    await wait(300);

    const notStartedByPlayer = await emit(A, 'room:start', { roomId });
    check(notStartedByPlayer?.ok === false, 'start refusé pour un joueur', notStartedByPlayer);

    const started = await emit(O, 'room:start', { roomId });
    check(started?.ok === true, 'start par l\'owner accepté', started);
    await wait(300);

    const listed = await api('/rooms');
    check(!listed.json.some((r) => r.id === roomId), 'salle retirée de la liste');

    const snapA = A.snapshots.at(-1);
    check(snapA?.state === 'question_active', 'joueur reçoit question_active');
    const leaks = JSON.stringify(snapA).match(/"correct":true|"accepted"/);
    check(!leaks, 'pas de bonne réponse en question_active', leaks);
    check(!snapA?.players.some((p) => p.id === String(owner.user.id)), 'owner absent des joueurs');

    B.socket.disconnect();
    await wait(200);
    B = await connect(bob.token);
    const snapshotsBeforeRejoin = B.snapshots.length;
    B.socket.emit('room:join', { roomId });
    await wait(1000);
    const rejoinedSnapshot = B.snapshots.slice(snapshotsBeforeRejoin)
        .find((snapshot) => snapshot.state === 'question_active');
    check(
        !!rejoinedSnapshot,
        'Bob reçoit le snapshot question_active dans la seconde suivant room:join',
        B.snapshots.slice(snapshotsBeforeRejoin),
    );

    const ans1 = await emit(A, 'room:answer', { roomId, value: ['A'] });
    await wait(300);
    check(
        B.snapshots.at(-1)?.answeredPlayerIds?.includes(String(alice.user.id)),
        'Bob voit qui a répondu sans voir la valeur pendant question_active',
        B.snapshots.at(-1)?.answeredPlayerIds,
    );
    check(ans1?.accepted === true, 'réponse acceptée une fois', ans1);
    check(ans1?.isCorrect === undefined, 'isCorrect non révélé en question_active', ans1);
    const bobSnapshotAfterAnswer = B.snapshots.at(-1);
    check(
        bobSnapshotAfterAnswer?.state === 'question_active'
            && bobSnapshotAfterAnswer.currentQuestionAnswers.length === 0
            && bobSnapshotAfterAnswer.answeredPlayerIds.includes(String(alice.user.id)),
        'Bob voit qui a répondu sans voir la valeur pendant question_active',
        bobSnapshotAfterAnswer,
    );
    const ans2 = await emit(A, 'room:answer', { roomId, value: ['A'] });
    check(ans2?.accepted === false, 'double réponse refusée', ans2);

    const lockByPlayer = await emit(B, 'room:lock', { roomId });
    check(lockByPlayer?.ok === false, 'lock refusé pour un joueur');
    check(A.snapshots.at(-1)?.state === 'question_active', 'état inchangé après lock refusé');

    await emit(B, 'room:answer', { roomId, value: ['B'] });
    await wait(300);
    check(A.snapshots.at(-1)?.state === 'question_locked', 'verrouillage automatique après toutes les réponses');

    await emit(O, 'room:correct', { roomId });
    await emit(O, 'room:next', { roomId });
    await wait(200);
    check(A.snapshots.at(-1)?.state === 'question_active', 'question 2 active');

    await emit(A, 'room:answer', { roomId, value: 'texte' });
    await emit(B, 'room:answer', { roomId, value: 'texte' });
    await wait(200);
    await emit(O, 'room:lock', { roomId });
    await emit(O, 'room:correct', { roomId });
    await emit(O, 'room:validate', { roomId, playerId: String(alice.user.id), isCorrect: true });
    await emit(O, 'room:validate', { roomId, playerId: String(bob.user.id), isCorrect: false });
    await emit(O, 'room:next', { roomId });
    await wait(500);

    check(A.events.ended.length === 1, 'joueur A reçoit game:ended', A.events.ended);
    check(B.events.ended.length === 1, 'joueur B reçoit game:ended', B.events.ended);
    check(O.events.ended.length === 0, 'owner ne reçoit pas game:ended');

    const after = await api('/rooms');
    check(!after.json.some((r) => r.id === roomId), 'salle non listée après fin');

    const detail = await api(`/rooms/${roomId}`);
    check(detail.status === 200, 'la salle existe toujours en base après la fin', detail);
    check(detail.json.state === 'FINISHED', 'Room.state vaut FINISHED en base', detail.json);

    [O, A, B].forEach((c) => c.socket.disconnect());
}

main().catch((err) => {
    console.error('Erreur du scénario :', err);
    process.exit(1);
});