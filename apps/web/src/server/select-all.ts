/**
 * Most rows «Seleccionar todas las que cumplen los filtros» brings in one go (fase 15): more is
 * not a list anyone prints or pastes.
 */
export const SELECT_ALL_MAX = 5000;

/** What «Seleccionar todas» says when the filters match more than `SELECT_ALL_MAX`. */
export const SELECT_ALL_TOO_MANY = `Son más de ${SELECT_ALL_MAX.toLocaleString("es-ES")}: afina los filtros.`;
