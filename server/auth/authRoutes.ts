import type { Express, Request, Response, NextFunction } from 'express';
import {
  authenticateOrRegister,
  createCharacterForAccount,
  deleteCharacterForAccount,
  listCharactersForAccount,
  loginAccount,
  registerAccount,
} from './accountRepository.js';
import { issueSessionToken, verifySessionToken } from './sessionTokens.js';
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
 */
export function registerAuthRoutes(app: Express): void {
  app.post('/api/auth', async (req, res) => {
    const { login, password } = (req.body ?? {}) as { login?: string; password?: string };
    const result = await authenticateOrRegister(login ?? '', password ?? '');
    if (result.ok === false) {
      // 401 for wrongCredentials (existing account, bad password);
      // 400 for invalidLogin / invalidPassword shape problems.
      const status = result.error === 'wrongCredentials' ? 401 : 400;
      res.status(status).send({ error: result.error });
      return;
    }
    res.status(result.created ? 201 : 200).send({
      token: issueSessionToken(result.account.id),
      login: result.account.login,
      created: result.created,
    });
  });

  app.post('/api/auth/register', async (req, res) => {
    const { login, password } = (req.body ?? {}) as { login?: string; password?: string };
    const result = await registerAccount(login ?? '', password ?? '');
    if (result.ok === false) {
      res.status(400).send({ error: result.error });
      return;
    }
    res.status(201).send({
      token: issueSessionToken(result.account.id),
      login: result.account.login,
    });
  });

  app.post('/api/auth/login', async (req, res) => {
    const { login, password } = (req.body ?? {}) as { login?: string; password?: string };
    const result = await loginAccount(login ?? '', password ?? '');
    if (result.ok === false) {
      res.status(401).send({ error: result.error });
      return;
    }
    res.status(200).send({
      token: issueSessionToken(result.account.id),
      login: result.account.login,
    });
  });

  app.get('/api/account/characters', requireAuth, async (req, res) => {
    const accountId = (req as Request & { accountId: string }).accountId;
    const characters = await listCharactersForAccount(accountId);
    res.status(200).send({ characters });
  });

  app.post('/api/account/characters', requireAuth, async (req, res) => {
    const accountId = (req as Request & { accountId: string }).accountId;
    const { name, race, className } = (req.body ?? {}) as { name?: string; race?: string; className?: string };
    if (!name || !race || !className) {
      res.status(400).send({ error: 'invalidRequest' });
      return;
    }
    if (!CHARACTER_RACES.includes(race as CharacterRace)
      || !CLASS_SKILL_TREES[className as CharacterClass]
      || !isClassAllowedForRace(race as CharacterRace, className as CharacterClass)) {
      res.status(400).send({ error: 'invalidIdentity' });
      return;
    }
    const result = await createCharacterForAccount(accountId, name, race, className);
    if (result.ok === false) {
      res.status(400).send({ error: result.error });
      return;
    }
    res.status(201).send({ ok: true });
  });

  app.delete('/api/account/characters/:name', requireAuth, async (req, res) => {
    const accountId = (req as Request & { accountId: string }).accountId;
    const name = String(req.params.name ?? '');
    await deleteCharacterForAccount(accountId, name);
    res.status(204).send();
  });
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
