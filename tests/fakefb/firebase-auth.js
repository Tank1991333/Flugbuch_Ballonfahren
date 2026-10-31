const U = window.__fakeUsers ||= { "admin@test.at": { pw: "geheim1", uid: "ahg4hJgbbcflgWxyerVdW7O0vvO2", verified: true }, "gast@test.at": { pw: "geheim1", uid: "GASTUID000000000000000000001", verified: true } };
let cur = null; const subs = [];
const mk = m => ({ uid: U[m].uid, email: m, emailVerified: !!U[m].verified, getIdToken: async () => "token" });
const merken = () => sessionStorage.setItem("__fakeNeu", JSON.stringify(Object.fromEntries(Object.entries(U).filter(([m]) => !["admin@test.at", "gast@test.at"].includes(m)))));
{ const m = sessionStorage.getItem("__fakeLogin"), neu = JSON.parse(sessionStorage.getItem("__fakeNeu") || "{}"); Object.assign(U, neu); if (m && U[m]) cur = mk(m); }
const fire = () => { if (cur) sessionStorage.setItem("__fakeLogin", cur.email); else sessionStorage.removeItem("__fakeLogin"); subs.forEach(f => f(cur)); };
const err = c => Object.assign(new Error(c), { code: c });
if (!Object.getOwnPropertyDescriptor(window, "__bestaetigungen")) window.__bestaetigungen = 0;
window.__fakeVerify = m => { U[m].verified = true; merken(); };
const AUTH = { get currentUser() { return cur; } };
export const getAuth = () => AUTH;
export const initializeAuth = (a, o) => { window.__authInit = (window.__authInit || 0) + 1; window.__authPersist = o?.persistence?.length; return AUTH; };
export const indexedDBLocalPersistence = { type: "LOCAL" }, browserLocalPersistence = { type: "LOCAL" };
export const onAuthStateChanged = (a, f) => { subs.push(f); setTimeout(() => f(cur), 10); };
export async function signInWithEmailAndPassword(a, m, p) { const u = U[m]; if (!u || u.pw !== p) throw err("auth/invalid-credential"); cur = mk(m); fire(); }
export async function createUserWithEmailAndPassword(a, m, p) { if (U[m]) throw err("auth/email-already-in-use"); if (p.length < 6) throw err("auth/weak-password"); U[m] = { pw: p, uid: "NEU" + Date.now(), verified: false }; merken(); cur = mk(m); fire(); return { user: cur }; }
export async function signOut() { cur = null; fire(); }
export async function sendPasswordResetEmail(a, m) { window.__resets = (window.__resets || []).concat(m); }
export async function sendEmailVerification(u) { window.__bestaetigungen++; }
export async function reload(u) { u.emailVerified = !!U[u.email]?.verified; }
export const EmailAuthProvider = { credential: (email, pw) => ({ email, pw }) };
export async function reauthenticateWithCredential(u, c) { if (U[c.email]?.pw !== c.pw) throw err("auth/invalid-credential"); }
export async function deleteUser(u) { delete U[u.email]; merken(); window.__geloeschteKonten = (window.__geloeschteKonten || 0) + 1; cur = null; fire(); }
export const __user = () => cur;
