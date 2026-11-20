import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_MAX_AGE_SECONDS, sessionExpiry } from "./session-expiry";

const at = (iso: string) => new Date(iso);

describe("sessionExpiry", () => {
  it("ends every session on the next Sunday at 00:00 in Madrid", () => {
    // Jueves 19/11/2026 a las 10:00 en Madrid (09:00 UTC, invierno: UTC+1).
    expect(sessionExpiry(at("2026-11-19T09:00:00Z")).toISOString()).toBe(
      "2026-11-21T23:00:00.000Z",
    );
    // Lunes por la mañana: hasta el domingo de esa misma semana.
    expect(sessionExpiry(at("2026-11-16T07:00:00Z")).toISOString()).toBe(
      "2026-11-21T23:00:00.000Z",
    );
  });

  it("starts a new week when someone signs in on Sunday", () => {
    // Domingo 22/11 a las 10:00 en Madrid: hasta el domingo siguiente.
    expect(sessionExpiry(at("2026-11-22T09:00:00Z")).toISOString()).toBe(
      "2026-11-28T23:00:00.000Z",
    );
  });

  it("gives at least 12 hours: a Saturday-night session lasts until the Sunday after", () => {
    // Sábado 21/11 a las 22:00 en Madrid: faltan 2 horas, así que hasta el domingo 29.
    expect(sessionExpiry(at("2026-11-21T21:00:00Z")).toISOString()).toBe(
      "2026-11-28T23:00:00.000Z",
    );
    // Sábado a las 11:00: faltan 13 horas, se queda en este domingo.
    expect(sessionExpiry(at("2026-11-21T10:00:00Z")).toISOString()).toBe(
      "2026-11-21T23:00:00.000Z",
    );
  });

  it("keeps Madrid's midnight across the summer time change", () => {
    // Jueves 26/03/2026: el domingo 29 empieza el horario de verano, pero la medianoche del
    // domingo aún es invierno (UTC+1).
    expect(sessionExpiry(at("2026-03-26T09:00:00Z")).toISOString()).toBe(
      "2026-03-28T23:00:00.000Z",
    );
    // En verano (UTC+2): domingo 00:00 en Madrid son las 22:00 UTC del sábado.
    expect(sessionExpiry(at("2026-07-09T09:00:00Z")).toISOString()).toBe(
      "2026-07-11T22:00:00.000Z",
    );
  });

  it("never lasts longer than the cookie", () => {
    const start = at("2026-11-21T10:59:00Z");
    const seconds = (sessionExpiry(start).getTime() - start.getTime()) / 1000;
    expect(seconds).toBeLessThanOrEqual(SESSION_COOKIE_MAX_AGE_SECONDS);
  });

  it("never lasts longer than the cookie the week summer time ends", () => {
    // Sábado 24/10/2026 a las 12:15 en Madrid (10:15 UTC): faltan menos de 12 horas, así que
    // hasta el domingo 1/11, y esa semana el domingo 25 tiene 25 horas. Antes la cookie se iba
    // una hora antes que la sesión.
    const start = at("2026-10-24T10:15:00Z");
    expect(sessionExpiry(start).toISOString()).toBe("2026-10-31T23:00:00.000Z");
    const seconds = (sessionExpiry(start).getTime() - start.getTime()) / 1000;
    expect(seconds).toBeLessThanOrEqual(SESSION_COOKIE_MAX_AGE_SECONDS);
  });
});
