let asistenciaActiva = null;
let ubicacionDocente = null;
let distanciaCalculada = null;
let intervaloContador = null;
let registroGuardadoId = null;
let deviceId = null;

document.addEventListener("DOMContentLoaded", () => {
  deviceId = obtenerDeviceId();

  cargarAsistenciaDisponible();

  document.getElementById("celular").addEventListener("input", limpiarCelular);
  document.getElementById("dni").addEventListener("input", limpiarDni);
  document.getElementById("btnVerificarUbicacion").addEventListener("click", verificarUbicacionDocente);
  document.getElementById("formDocente").addEventListener("submit", enviarAsistencia);
  document.getElementById("btnAnular").addEventListener("click", anularAsistencia);
});

function obtenerDeviceId() {
  let id = localStorage.getItem("device_id_asistencia_unh");

  if (!id) {
    id = "device_" + crypto.randomUUID();
    localStorage.setItem("device_id_asistencia_unh", id);
  }

  return id;
}

function limpiarCelular() {
  const celular = document.getElementById("celular");
  celular.value = celular.value.replace(/\D/g, "").slice(0, 9);
}

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
    .order("fecha", { ascending: true })
    .order("hora_inicio", { ascending: true });

  if (error) {
    console.error(error);
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

  await verificarRegistroDelDispositivo();

  iniciarContador(activa);
}

async function verificarRegistroDelDispositivo() {
  const { data, error } = await supabaseClient
    .from("registros_asistencia")
    .select("id")
    .eq("asistencia_programada_id", asistenciaActiva.id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    console.error(error);
    mostrarToast("No se pudo verificar el registro del dispositivo.", "error");
    bloquearTodo();
    return;
  }

  if (data) {
    registroGuardadoId = data.id;
    mostrarEstadoExito("Este dispositivo ya registró asistencia");
    bloquearCamposDespuesDeEnviar();

    if (asistenciaEstaActiva(asistenciaActiva)) {
      mostrarBotonAnular();
    }

    return;
  }

  mostrarEstadoActivo("Asistencia habilitada");
  desbloquearFormulario();
}

function mostrarEstadoActivo(titulo) {
  const card = document.getElementById("estadoAsistencia");
  card.className = "status-card active";
  document.getElementById("estadoTexto").textContent = titulo;
  document.getElementById("descripcionAsistencia").textContent = "";
}

function mostrarEstadoCerrado(titulo) {
  const card = document.getElementById("estadoAsistencia");
  card.className = "status-card closed";
  document.getElementById("estadoTexto").textContent = titulo;
  document.getElementById("descripcionAsistencia").textContent = "";
  document.getElementById("contador").textContent = "00:00";
}

function mostrarEstadoExito(titulo) {
  const card = document.getElementById("estadoAsistencia");
  card.className = "status-card success";
  document.getElementById("estadoTexto").textContent = titulo;
  document.getElementById("descripcionAsistencia").textContent = "";
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

function verificarUbicacionDocente() {
  if (!asistenciaActiva) {
    mostrarToast("No hay asistencia activa en este momento.", "error");
    return;
  }

  if (!navigator.geolocation) {
    mostrarToast("Este dispositivo no permite geolocalización.", "error");
    return;
  }

  mostrarToast("Solicitando permiso de ubicación...", "warning");

  navigator.geolocation.getCurrentPosition(
    (posicion) => {
      ubicacionDocente = {
        latitud: posicion.coords.latitude,
        longitud: posicion.coords.longitude,
      };

      distanciaCalculada = calcularDistanciaMetros(
        asistenciaActiva.latitud,
        asistenciaActiva.longitud,
        ubicacionDocente.latitud,
        ubicacionDocente.longitud
      );

      const estadoUbicacion = document.getElementById("ubicacionEstado");

      if (distanciaCalculada <= asistenciaActiva.radio_metros) {
        estadoUbicacion.className = "location-status ok";
        estadoUbicacion.textContent =
          `Ubicación válida. Distancia aproximada: ${Math.round(distanciaCalculada)} metros.`;

        document.getElementById("btnEnviar").disabled = false;
        mostrarToast("Ubicación verificada correctamente.", "success");
      } else {
        estadoUbicacion.className = "location-status error";
        estadoUbicacion.textContent =
          `Fuera del perímetro autorizado. Distancia aproximada: ${Math.round(distanciaCalculada)} metros.`;

        document.getElementById("btnEnviar").disabled = true;
        mostrarToast("No puede registrar asistencia fuera del rango permitido.", "error");
      }
    },
    () => {
      mostrarToast("Debe permitir el acceso a su ubicación para registrar asistencia.", "error");
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    }
  );
}

function validarFormularioDocente() {
  const dni = document.getElementById("dni").value.trim();
  const nombres = document.getElementById("nombres").value.trim();
  const apellidoPaterno = document.getElementById("apellidoPaterno").value.trim();
  const apellidoMaterno = document.getElementById("apellidoMaterno").value.trim();
  const celular = document.getElementById("celular").value.trim();
  const departamento = document.getElementById("departamento").value;

  if (!dni || !nombres || !apellidoPaterno || !apellidoMaterno || !celular || !departamento) {
    mostrarToast("Complete todos los campos obligatorios.", "error");
    return false;
  }

  if (!/^\d{8}$/.test(dni)) {
    mostrarToast("El DNI debe contener exactamente 8 números.", "error");
    return false;
  }

  if (!/^\d{9}$/.test(celular)) {
    mostrarToast("El celular debe contener exactamente 9 números.", "error");
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

  await verificarRegistroDelDispositivo();

  if (registroGuardadoId) {
    mostrarToast("Este dispositivo ya registró asistencia.", "warning");
    return;
  }

  if (!validarFormularioDocente()) return;

  if (!ubicacionDocente || distanciaCalculada === null) {
    mostrarToast("Primero debe verificar su ubicación.", "error");
    return;
  }

  if (distanciaCalculada > asistenciaActiva.radio_metros) {
    mostrarToast("No puede registrar asistencia fuera del rango autorizado.", "error");
    return;
  }

  const registro = {
    asistencia_programada_id: asistenciaActiva.id,
    device_id: deviceId,
    dni: document.getElementById("dni").value.trim(),
    nombres: document.getElementById("nombres").value.trim(),
    apellido_paterno: document.getElementById("apellidoPaterno").value.trim(),
    apellido_materno: document.getElementById("apellidoMaterno").value.trim(),
    celular: document.getElementById("celular").value.trim(),
    correo: document.getElementById("correo").value.trim(),
    departamento: document.getElementById("departamento").value,
    latitud_docente: ubicacionDocente.latitud,
    longitud_docente: ubicacionDocente.longitud,
    distancia_metros: distanciaCalculada,
  };

  const { data, error } = await supabaseClient
    .from("registros_asistencia")
    .insert([registro])
    .select("id")
    .single();

  if (error) {
    console.error(error);

    if (error.code === "23505") {
      await verificarRegistroDelDispositivo();
      mostrarToast("Este dispositivo ya registró asistencia.", "warning");
      return;
    }

    mostrarToast("No se pudo registrar la asistencia. Intente nuevamente.", "error");
    return;
  }

  registroGuardadoId = data.id;

  mostrarToast("Asistencia registrada correctamente.", "success");
  mostrarEstadoExito("Asistencia registrada");
  bloquearCamposDespuesDeEnviar();

  if (asistenciaEstaActiva(asistenciaActiva)) {
    mostrarBotonAnular();
  }
}

async function anularAsistencia() {
  if (!registroGuardadoId) {
    mostrarToast("No se encontró un registro para anular.", "error");
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
    .eq("id", registroGuardadoId)
    .eq("device_id", deviceId);

  if (error) {
    console.error(error);
    mostrarToast("No se pudo anular la asistencia.", "error");
    return;
  }

  registroGuardadoId = null;
  ubicacionDocente = null;
  distanciaCalculada = null;

  document.getElementById("ubicacionEstado").className = "location-status";
  document.getElementById("ubicacionEstado").textContent = "Verifique su ubicación";

  ocultarBotonAnular();
  desbloquearFormulario();
  mostrarEstadoActivo("Asistencia habilitada");

  mostrarToast("Asistencia anulada. Puede registrar nuevamente.", "success");
}

function bloquearCamposDespuesDeEnviar() {
  document.querySelectorAll("#formDocente input, #formDocente select").forEach((el) => {
    el.disabled = true;
  });

  document.getElementById("btnVerificarUbicacion").disabled = true;
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

  document.getElementById("btnVerificarUbicacion").disabled = false;
  document.getElementById("btnEnviar").disabled = true;
  ocultarBotonAnular();
}

function mostrarBotonAnular() {
  const btn = document.getElementById("btnAnular");
  btn.hidden = false;
  btn.disabled = false;
}

function ocultarBotonAnular() {
  const btn = document.getElementById("btnAnular");
  btn.hidden = true;
  btn.disabled = true;
}