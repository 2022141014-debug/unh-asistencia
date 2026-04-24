function mostrarToast(mensaje, tipo = "success") {
  const toast = document.getElementById("toast");

  if (!toast) return;

  toast.textContent = mensaje;
  toast.className = `toast show ${tipo}`;

  setTimeout(() => {
    toast.className = "toast";
  }, 4200);
}

function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
  const radioTierra = 6371e3;

  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return radioTierra * c;
}

function obtenerFechaHoy() {
  return new Date().toISOString().split("T")[0];
}

function horaActualHHMM() {
  const ahora = new Date();
  return ahora.toTimeString().slice(0, 5);
}

function estaDentroDelHorario(fecha, horaInicio, horaFin) {
  const hoy = obtenerFechaHoy();
  const horaActual = horaActualHHMM();

  return hoy === fecha && horaActual >= horaInicio.slice(0, 5) && horaActual <= horaFin.slice(0, 5);
}

function calcularEstadoAsistencia(asistencia) {
  const hoy = obtenerFechaHoy();
  const horaActual = horaActualHHMM();

  if (hoy < asistencia.fecha) return "programada";
  if (hoy > asistencia.fecha) return "finalizada";

  if (horaActual < asistencia.hora_inicio.slice(0, 5)) return "programada";
  if (horaActual > asistencia.hora_fin.slice(0, 5)) return "finalizada";

  return "activa";
}

function formatearHora(hora) {
  return hora ? hora.slice(0, 5) : "--:--";
}