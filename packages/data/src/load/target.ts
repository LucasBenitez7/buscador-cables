/**
 * Checks the load does before writing the client's data anywhere: which database it is
 * about to write to and who signs it.
 */

/** Databases the tests empty on every run: the client's data must never land there. */
const TEST_DATABASE = /_(test|e2e)$/;

/**
 * "cables en localhost:5433": where the load is going, without user or password. Throws
 * for a URL that is not a database or that points at one of the test databases.
 */
export function describeTarget(databaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL no es una URL de base de datos válida.");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) {
    throw new Error("DATABASE_URL no indica el nombre de la base de datos.");
  }
  if (TEST_DATABASE.test(database)) {
    throw new Error(
      `La base "${database}" es de tests y se vacía en cada ejecución: no se cargan ahí los datos del proyecto.`,
    );
  }
  return `${database} en ${url.host}`;
}

/**
 * Why this user cannot sign a load, or null if they can. The load writes history events in
 * their name, so they must be somebody who could import from the app.
 */
export function signerProblem(
  email: string,
  user: { active: boolean; canImport: boolean } | null,
): string | null {
  if (!user) return `No existe ningún usuario con el correo ${email}.`;
  if (!user.active) return `La cuenta ${email} está desactivada: no puede firmar una carga.`;
  if (!user.canImport) {
    return `${email} no tiene permiso para importar: la carga la firma un supervisor o un administrador.`;
  }
  return null;
}
