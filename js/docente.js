let asistenciaActiva = null;
let intervaloContador = null;
let registroGuardadoId = null;

document.addEventListener("DOMContentLoaded", () => {
  cargarAsistenciaDisponible();

  document.getElementById("dni").addEventListener("input", limpiarDni);
  document.getElementById("formDocente").addEventListener("submit", enviarAsistencia);
  document.getElementById("btnAnular").addEventListener("click", anularAsistencia);
});

function limpiarDni() {
  const dni = document.getElementById("dni");
  dni.value = dni.value.replace(/\D/g, "").slice(0, 8);
}

function fechaLocalHoy() {
  const ahora = new Date();
  const year = ahora.getFullYear();
  const month = String(ahora.getMonth() + 1).padStart(2, "0");
  const day = String(ahora.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function minutosDeHora(hora) {
  const partes = hora.slice(0, 5).split(":");
  return Number(partes[0]) * 60 + Number(partes[1]);
}

function minutosActuales() {
  const ahora = new Date();
  return ahora.getHours() * 60 + ahora.getMinutes();
}

function asistenciaEstaActiva(a) {
  return (
    a.fecha === fechaLocalHoy() &&
    minutosActuales() >= minutosDeHora(a.hora_inicio) &&
    minutosActuales() <= minutosDeHora(a.hora_fin)
  );
}

async function cargarAsistenciaDisponible() {
  const { data, error } = await supabaseClient
    .from("asistencias_programadas")
    .select("*")
    .eq("fecha", fechaLocalHoy())
    .order("hora_inicio", { ascending: true });

  if (error) {
    console.error("Error cargando asistencia:", error);
    mostrarEstadoCerrado("Error del sistema");
    bloquearTodo();
    return;
  }

  const activa = (data || []).find(asistenciaEstaActiva);

  if (!activa) {
    mostrarEstadoCerrado("Asistencia no habilitada");
    bloquearTodo();
    return;
  }

  asistenciaActiva = activa;

  mostrarEstadoActivo("Asistencia habilitada");
  ocultarAvisoConstancia();
  desbloquearFormulario();
  iniciarContador(activa);
}

function mostrarEstadoActivo(titulo) {
  const card = document.getElementById("estadoAsistencia");
  card.className = "status-card active";
  document.getElementById("estadoTexto").textContent = titulo;

  const descripcion = document.getElementById("descripcionAsistencia");
  if (descripcion) descripcion.textContent = "";
}

function mostrarEstadoCerrado(titulo) {
  const card = document.getElementById("estadoAsistencia");
  card.className = "status-card closed";
  document.getElementById("estadoTexto").textContent = titulo;

  const descripcion = document.getElementById("descripcionAsistencia");
  if (descripcion) descripcion.textContent = "";

  document.getElementById("contador").textContent = "00:00";
}

function mostrarEstadoExito(titulo) {
  const card = document.getElementById("estadoAsistencia");
  card.className = "status-card success";
  document.getElementById("estadoTexto").textContent = titulo;

  const descripcion = document.getElementById("descripcionAsistencia");
  if (descripcion) descripcion.textContent = "";
}

function mostrarAvisoConstancia() {
  const aviso = document.getElementById("avisoConstancia");
  if (aviso) aviso.hidden = false;
}

function ocultarAvisoConstancia() {
  const aviso = document.getElementById("avisoConstancia");
  if (aviso) aviso.hidden = true;
}

function iniciarContador(asistencia) {
  const contador = document.getElementById("contador");

  if (intervaloContador) clearInterval(intervaloContador);

  intervaloContador = setInterval(() => {
    const ahora = new Date();
    const [hora, minuto] = asistencia.hora_fin.slice(0, 5).split(":");

    const fin = new Date();
    fin.setHours(Number(hora), Number(minuto), 0, 0);

    const diferencia = fin - ahora;

    if (diferencia <= 0) {
      contador.textContent = "00:00";
      mostrarEstadoCerrado("Tiempo finalizado");
      bloquearTodo();
      ocultarBotonAnular();
      clearInterval(intervaloContador);
      return;
    }

    const minutos = Math.floor(diferencia / 60000);
    const segundos = Math.floor((diferencia % 60000) / 1000);

    contador.textContent =
      `${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`;
  }, 1000);
}

function validarFormularioDocente() {
  const dni = document.getElementById("dni").value.trim();
  const apellidosNombres = document.getElementById("apellidosNombres").value.trim();
  const departamento = document.getElementById("departamento").value;

  if (!dni || !apellidosNombres || !departamento) {
    mostrarToast("Complete todos los campos obligatorios.", "error");
    return false;
  }

  if (!/^\d{8}$/.test(dni)) {
    mostrarToast("El DNI debe contener exactamente 8 números.", "error");
    return false;
  }

  return true;
}

async function enviarAsistencia(evento) {
  evento.preventDefault();

  if (!asistenciaActiva) {
    mostrarToast("No hay asistencia activa.", "error");
    return;
  }

  if (!asistenciaEstaActiva(asistenciaActiva)) {
    mostrarToast("El tiempo de asistencia ya terminó.", "error");
    bloquearTodo();
    return;
  }

  if (!validarFormularioDocente()) return;

  const btnEnviar = document.getElementById("btnEnviar");
  btnEnviar.disabled = true;
  btnEnviar.textContent = "Guardando...";

  const registro = {
    asistencia_programada_id: asistenciaActiva.id,
    dni: document.getElementById("dni").value.trim(),
    nombres: document.getElementById("apellidosNombres").value.trim(),
    apellido_paterno: null,
    apellido_materno: null,
    celular: null,
    departamento: document.getElementById("departamento").value
  };

  const { data, error } = await supabaseClient
    .from("registros_asistencia")
    .insert([registro])
    .select("id")
    .single();

  if (error) {
    console.error("Error guardando asistencia:", error);
    mostrarToast("No se pudo registrar la asistencia.", "error");

    btnEnviar.disabled = false;
    btnEnviar.textContent = "Enviar asistencia";
    return;
  }

  registroGuardadoId = data.id;

  mostrarToast("Asistencia registrada correctamente.", "success");
  mostrarEstadoExito("Asistencia registrada");
  mostrarAvisoConstancia();
  bloquearCamposDespuesDeEnviar();
  mostrarBotonAnular();

  btnEnviar.textContent = "Asistencia enviada";
}

async function anularAsistencia() {
  if (!registroGuardadoId) {
    mostrarToast("No se encontró asistencia registrada para anular.", "error");
    return;
  }

  if (!asistenciaActiva || !asistenciaEstaActiva(asistenciaActiva)) {
    mostrarToast("El tiempo terminó. Ya no puede anular la asistencia.", "error");
    ocultarBotonAnular();
    return;
  }

  const confirmar = confirm(
    "¿Está seguro de anular su asistencia?\n\nSe eliminará el registro guardado y podrá registrar nuevamente mientras el tiempo siga activo."
  );

  if (!confirmar) return;

  const { error } = await supabaseClient
    .from("registros_asistencia")
    .delete()
    .eq("id", registroGuardadoId);

  if (error) {
    console.error("Error anulando asistencia:", error);
    mostrarToast("No se pudo anular la asistencia.", "error");
    return;
  }

  registroGuardadoId = null;

  document.getElementById("formDocente").reset();

  ocultarAvisoConstancia();
  ocultarBotonAnular();
  desbloquearFormulario();
  mostrarEstadoActivo("Asistencia habilitada");

  mostrarToast("Asistencia anulada. Puede registrar nuevamente.", "success");
}

function bloquearCamposDespuesDeEnviar() {
  document.querySelectorAll("#formDocente input, #formDocente select").forEach((el) => {
    el.disabled = true;
  });

  document.getElementById("btnEnviar").disabled = true;
}

function bloquearTodo() {
  document.querySelectorAll("#formDocente input, #formDocente select, #formDocente button").forEach((el) => {
    el.disabled = true;
  });
}

function desbloquearFormulario() {
  document.querySelectorAll("#formDocente input, #formDocente select").forEach((el) => {
    el.disabled = false;
  });

  const btnEnviar = document.getElementById("btnEnviar");
  btnEnviar.disabled = false;
  btnEnviar.textContent = "Enviar asistencia";

  ocultarBotonAnular();
}

function mostrarBotonAnular() {
  const btn = document.getElementById("btnAnular");
  if (!btn) return;

  btn.hidden = false;
  btn.disabled = false;
}

function ocultarBotonAnular() {
  const btn = document.getElementById("btnAnular");
  if (!btn) return;

  btn.hidden = true;
  btn.disabled = true;
}