export interface UserRecord {
  username: string;
  bestScore: number;
  gamesPlayed: number;
  createdAt: number;
}

const USERS_KEY = 'hsq_users_v1';
const CURRENT_USER_KEY = 'hsq_current_user_v1';

function readUsers(): Record<string, UserRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeUsers(users: Record<string, UserRecord>) {
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function loginOrRegister(username: string): UserRecord {
  const clean = username.trim();
  const users = readUsers();
  if (!users[clean]) {
    users[clean] = {
      username: clean,
      bestScore: 0,
      gamesPlayed: 0,
      createdAt: Date.now(),
    };
    writeUsers(users);
  }
  window.localStorage.setItem(CURRENT_USER_KEY, clean);
  return users[clean];
}

export function getCurrentUser(): UserRecord | null {
  if (typeof window === 'undefined') return null;
  const name = window.localStorage.getItem(CURRENT_USER_KEY);
  if (!name) return null;
  const users = readUsers();
  return users[name] ?? null;
}

export function logout() {
  window.localStorage.removeItem(CURRENT_USER_KEY);
}

export function recordGameResult(username: string, score: number): UserRecord {
  const users = readUsers();
  const existing = users[username] ?? {
    username,
    bestScore: 0,
    gamesPlayed: 0,
    createdAt: Date.now(),
  };
  existing.gamesPlayed += 1;
  existing.bestScore = Math.max(existing.bestScore, score);
  users[username] = existing;
  writeUsers(users);
  return existing;
}

export function getHighScores(limit = 10): UserRecord[] {
  const users = readUsers();
  return Object.values(users)
    .sort((a, b) => b.bestScore - a.bestScore)
    .slice(0, limit);
}
