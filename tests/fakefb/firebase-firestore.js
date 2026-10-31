// Firestore-Attrappe: Daten liegen im Testprozess (window.__db), Regeln wie in README (Freigabe-Modus)
import { __user } from "./firebase-auth.js";
const ADMIN = "ahg4hJgbbcflgWxyerVdW7O0vvO2";
const deny = () => { throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }); };
async function allowed(path, op, v) {
  const u = __user();
  if (path.startsWith("live/") && op === "read") { const d = await window.__db("get", path); return !!d && d.ablauf > Date.now(); } // ohne Anmeldung mit Link
  if (!u) return false;
  if (path.startsWith("live/")) { const isA = u.uid === ADMIN, frei = !!u.emailVerified && !!(await window.__db("get", "freigaben/" + u.uid)), alt = await window.__db("get", path);
    if (op === "delete") return alt?.uid === u.uid;
    return (isA || frei) && path.split("/")[1].length >= 20 && v?.uid === u.uid && v.ablauf <= Date.now() + 46800000 && (!alt || (alt.uid === u.uid && alt.ablauf === v.ablauf)); }
  const p = path.split("/"), isA = u.uid === ADMIN, best = !!u.emailVerified, frei = best && !!(await window.__db("get", "freigaben/" + u.uid));
  if (p[0] === "users") return p[1] === u.uid && (isA || frei);
  if (p[0] === "anfragen") return op === "write" ? best && p.length > 1 && p[1] === u.uid && Object.keys(v || {}).every(k => ["email", "zeit"].includes(k)) && v.email === u.email : p.length === 1 ? isA : (p[1] === u.uid || isA);
  if (p[0] === "freigaben") return op === "read" ? (p.length === 1 ? isA : (p[1] === u.uid || isA)) : op === "delete" ? (isA || p[1] === u.uid) : isA;
  if (p[0] === "fehler") return op === "write" ? (isA || frei) && v?.uid === u.uid && Object.keys(v).every(k => ["uid", "email", "msg", "quelle", "zeit", "version", "geraet"].includes(k)) && typeof v.msg === "string" && v.msg.length <= 500 && typeof v.quelle === "string" && v.quelle.length <= 1000 : isA;
  if (p[0] === "rueckmeldungen") return op === "write" ? (isA || frei) && v?.uid === u.uid && Object.keys(v).every(k => ["uid", "email", "text", "zeit", "version", "geraet"].includes(k)) && typeof v.text === "string" && v.text.length <= 4000 : isA;
  return false;
}
const ts = ms => ({ toMillis: () => ms });
const auspacken = v => v && JSON.parse(JSON.stringify(v), (k, x) => x && typeof x === "object" && "__ts" in x ? ts(x.__ts) : x);
export const Timestamp = { fromMillis: ts };
export const serverTimestamp = () => ({ __server: true });
export const getFirestore = () => ({});
export const doc = (b, ...s) => ({ path: [b.path, ...s].filter(Boolean).join("/") });
export const collection = (b, ...s) => ({ path: [b.path, ...s].filter(Boolean).join("/") });
export const where = (field, op, val) => ({ field, op, val });
export const query = (c, w) => ({ path: c.path, w });
const snap = (path, v) => ({ id: path.split("/").at(-1), exists: () => v != null, data: () => auspacken(v) });
export async function getDoc(r) { if (!await allowed(r.path, "read")) deny(); await window.__db("lese", 1); return snap(r.path, await window.__db("get", r.path)); }
export async function getDocs(c) {
  if (c.path === "live") { const u = __user(); if (!u || c.w?.field !== "uid" || c.w.op !== "==" || c.w.val !== u.uid) deny(); } // nur eigene Links auflisten
  else if (!await allowed(c.path, "read")) deny();
  let l = await window.__db("list", c.path);
  if (c.w?.op === "==") l = l.filter(([, v]) => v[c.w.field] === c.w.val);
  else if (c.w) l = l.filter(([, v]) => v[c.w.field]?.__ts >= c.w.val.toMillis());
  await window.__db("lese", Math.max(1, l.length));
  return { docs: l.map(([k, v]) => snap(k, v)) };
}
export async function setDoc(r, v, o) {
  if (!await allowed(r.path, "write", v)) deny();
  const x = JSON.parse(JSON.stringify(v, (k, y) => y && y.__server ? { __ts: Date.now() } : y));
  await window.__db("set", r.path, x, !!o?.merge);
}
export async function deleteDoc(r) { if (!await allowed(r.path, r.path.split("/").length === 2 ? "delete" : "write")) deny(); await window.__db("del", r.path); }

export function onSnapshot(r, next, fehler) { // Echtzeit-Abfrage, hier per Abfrage alle 300 ms
  let aus = false, zuletzt;
  const runde = async () => {
    if (aus) return;
    try { if (!await allowed(r.path, "read")) deny(); const v = await window.__db("get", r.path), j = JSON.stringify(v); if (j !== zuletzt) { zuletzt = j; next(snap(r.path, v)); } }
    catch (e) { aus = true; fehler?.(e); return; }
    setTimeout(runde, 300);
  };
  runde(); return () => { aus = true; };
}
