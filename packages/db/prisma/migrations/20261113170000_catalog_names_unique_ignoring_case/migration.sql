-- Los nombres de los catálogos son únicos sin distinguir mayúsculas ("Rojo" y "rojo" son el
-- mismo color). El servicio ya lo comprobaba con una lectura previa; sin el índice, dos
-- altas simultáneas entraban las dos. Prisma no modela índices sobre expresiones: van aquí.
CREATE UNIQUE INDEX "cable_type_name_lower_key" ON "cable_type" (lower("name"));
CREATE UNIQUE INDEX "color_name_lower_key" ON "color" (lower("name"));
CREATE UNIQUE INDEX "manufacturer_name_lower_key" ON "manufacturer" (lower("name"));
