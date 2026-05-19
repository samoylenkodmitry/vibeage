import type { Express, Request, Response, NextFunction } from 'express';
import {
  authenticateOrRegister,
  bumpAccountTokensValidAfter,
  createCharacterForAccount,
  deleteAccount,
  deleteCharacterForAccount,
  listCharactersForAccount,
  loginAccount,
  registerAccount,
} from './accountRepository.js';
import { issueSessionToken, revokeTokensForAccount, verifySessionToken } from './sessionTokens.js';
import { clientIp, recordAuthAuditEvent } from './authAudit.js';
import { CLASS_SKILL_TREES, type CharacterClass } from '../../packages/content/classes.js';
import { CHARACTER_RACES, isClassAllowedForRace, type CharacterRace } from '../../packages/content/races.js';

/**
 * Pre-game auth + character roster HTTP API. Sits on the same Express
 * app as /healthz; the world room (Colyseus) only deals with already-
 * authenticated players. World join takes the issued sessionToken +
 * the chosen character name; the room rejects unknown / unauthorised
 * pairs.
 *
 * Endpoints (all JSON):
 *   POST /api/auth           { login, password }    -> { token, login, created }
 *                              (login-or-register: creates if new, logs in
 *                               otherwise. Single-button UX entry point.)
 *   POST /api/auth/register  { login, password }    -> { token, login }
 *                              (explicit register; kept for compat)
 *   POST /api/auth/login     { login, password }    -> { token, login }
 *                              (explicit login; kept for compat)
 *   GET  /api/account/characters     (Bearer)       -> { characters: [...] }
 *   POST /api/account/characters     (Bearer)       -> 201 | error
 *   DELETE /api/account/characters/:name (Bearer)   -> 204
 *   DELETE /api/account                  (Bearer)   -> 204
 *                              (delete the whole account; cascades to
 *                               characters via ON DELETE CASCADE.)
 *   POST /api/auth/logout                (Bearer)   -> 204
 *                              (invalidate every session token issued
 *                               for this account; new logins issue
 *                               fresh tokens.)
 */
export function registerAuthRoutes(app: Express): void {
  app.post('/api/auth', handleAuthCombined);
  app.post('/api/auth/register', handleRegister);
  app.post('/api/auth/login', handleLogin);
  app.get('/api/account/characters', requireAuth, handleListCharacters);
  app.post('/api/account/characters', requireAuth, handleCreateCharacter);
  app.delete('/api/account/characters/:name', requireAuth, handleDeleteCharacter);
  app.delete('/api/account', requireAuth, handleDeleteAccount);
  app.post('/api/auth/logout', requireAuth, handleLogout);
}

async function handleAuthCombined(req: Request, res: Response): Promise<void> {
  const { login, password } = (req.body ?? {}) as { login?: string; password?: string };
  const remoteAddr = clientIp(req);
  const result = await authenticateOrRegister(login ?? '', password ?? '');
  if (result.ok === false) {
    // 401 for wrongCredentials (existing account, bad password);
    // 400 for invalidLogin / invalidPassword shape problems.
    const status = result.error === 'wrongCredentials' ? 401 : 400;
    void recordAuthAuditEvent({ type: 'auth.login.failure', login, reason: result.error, remoteAddr });
    res.status(status).send({ error: result.error });
    return;
  }
  void recordAuthAuditEvent({
    type: result.created ? 'auth.register.success' : 'auth.login.success',
    accountId: result.account.id, login: result.account.login, remoteAddr,
  });
  res.status(result.created ? 201 : 200).send({
    token: issueSessionToken(result.account.id), login: result.account.login, created: result.created,
  });
}

async function handleRegister(req: Request, res: Response): Promise<void> {
  const { login, password } = (req.body ?? {}) as { login?: string; password?: string };
  const remoteAddr = clientIp(req);
  const result = await registerAccount(login ?? '', password ?? '');
  if (result.ok === false) {
    void recordAuthAuditEvent({ type: 'auth.login.failure', login, reason: result.error, remoteAddr });
    res.status(400).send({ error: result.error });
    return;
  }
  void recordAuthAuditEvent({ type: 'auth.register.success', accountId: result.account.id, login: result.account.login, remoteAddr });
  res.status(201).send({ token: issueSessionToken(result.account.id), login: result.account.login });
}

async function handleLogin(req: Request, res: Response): Promise<void> {
  const { login, password } = (req.body ?? {}) as { login?: string; password?: string };
  const remoteAddr = clientIp(req);
  const result = await loginAccount(login ?? '', password ?? '');
  if (result.ok === false) {
    void recordAuthAuditEvent({ type: 'auth.login.failure', login, reason: result.error, remoteAddr });
    res.status(401).send({ error: result.error });
    return;
  }
  void recordAuthAuditEvent({ type: 'auth.login.success', accountId: result.account.id, login: result.account.login, remoteAddr });
  res.status(200).send({ token: issueSessionToken(result.account.id), login: result.account.login });
}

async function handleListCharacters(req: Request, res: Response): Promise<void> {
  const accountId = (req as Request & { accountId: string }).accountId;
  const characters = await listCharactersForAccount(accountId);
  res.status(200).send({ characters });
}

async function handleCreateCharacter(req: Request, res: Response): Promise<void> {
  const accountId = (req as Request & { accountId: string }).accountId;
  const { name, race, className } = (req.body ?? {}) as { name?: string; race?: string; className?: string };
  if (!name || !race || !className) { res.status(400).send({ error: 'invalidRequest' }); return; }
  if (!CHARACTER_RACES.includes(race as CharacterRace)
    || !CLASS_SKILL_TREES[className as CharacterClass]
    || !isClassAllowedForRace(race as CharacterRace, className as CharacterClass)) {
    res.status(400).send({ error: 'invalidIdentity' });
    return;
  }
  const result = await createCharacterForAccount(accountId, name, race, className);
  if (result.ok === false) { res.status(400).send({ error: result.error }); return; }
  void recordAuthAuditEvent({ type: 'character.create', accountId, characterName: name, remoteAddr: clientIp(req) });
  res.status(201).send({ ok: true });
}

async function handleDeleteCharacter(req: Request, res: Response): Promise<void> {
  const accountId = (req as Request & { accountId: string }).accountId;
  const name = String(req.params.name ?? '');
  await deleteCharacterForAccount(accountId, name);
  void recordAuthAuditEvent({ type: 'character.delete', accountId, characterName: name, remoteAddr: clientIp(req) });
  res.status(204).send();
}

async function handleDeleteAccount(req: Request, res: Response): Promise<void> {
  const accountId = (req as Request & { accountId: string }).accountId;
  await deleteAccount(accountId);
  void recordAuthAuditEvent({ type: 'account.delete', accountId, remoteAddr: clientIp(req) });
  res.status(204).send();
}

async function handleLogout(req: Request, res: Response): Promise<void> {
  const accountId = (req as Request & { accountId: string }).accountId;
  const at = new Date();
  await bumpAccountTokensValidAfter(accountId, at);
  revokeTokensForAccount(accountId, at.getTime());
  void recordAuthAuditEvent({ type: 'auth.logout', accountId, remoteAddr: clientIp(req) });
  res.status(204).send();
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  const verified = verifySessionToken(token);
  if (!verified) {
    res.status(401).send({ error: 'unauthorized' });
    return;
  }
  (req as Request & { accountId: string }).accountId = verified.accountId;
  next();
}
