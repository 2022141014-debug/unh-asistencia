let asistenciaActiva = null;
let ubicacionDocente = null;
let distanciaCalculada = null;
let precisionGps = null;
let radioPermitidoFinal = null;
let intervaloContador = null;
let registroGuardadoId = null;
let gpsWatcherId = null;
let gpsTimeoutId = null;

const MARGEN_EXTRA_EXTREMO = 20;
const TIEMPO_MAXIMO_GPS = 30000;

document.addEventListener("DOMContentLoaded", async () => {
  cargarAsistenciaDisponible();

  document.getElementById("dni").addEventListener("input", limpiarDni);
  document.getElementById("nombreCompleto").addEventListener("input", convertirNombreAMayusculas);
  document.getElementById("btnVerificarUbicacion").addEventListener("click", verificarUbicacionDocente);
  document.getElementById("formDocente").addEventListener("submit", enviarAsistencia);
  document.getElementById("btnAnular").addEventListener("click", anularAsistencia);
});

function limpiarDni() {
  const dni = document.getElementById("dni");
  dni.value = dni.value.replace(/\D/g, "").slice(0, 8);
}

function convertirNombreAMayusculas() {
  const nombre = document.getElementById("nombreCompleto");
  nombre.value = nombre.value.toUpperCase();
}

function normalizarEspacios(texto) {
  return String(texto || "").trim().replace(/\s+/g, " ");
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

  mostrarEstadoActivo("Asistencia habilitada");
  ocultarAvisoConstancia();
  desbloquearFormulario();

  iniciarContador(activa);
}

function mostrarEstadoActivo(titulo) {
  const card = document.getElementById("estadoAsistencia");
  card.className = "status-card active";
  document.getElementById("estadoTexto").textContent = titulo;
  document.getElementById("descripcionAsistencia").textContent =
    "Complete sus datos y verifique su ubicación para registrar asistencia.";
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
  document.getElementById("descripcionAsistencia").textContent =
    "Su asistencia fue enviada correctamente.";
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
      detenerSeguimientoGps();
      clearInterval(intervaloContador);
      return;
    }

    const minutos = Math.floor(diferencia / 60000);
    const segundos = Math.floor((diferencia % 60000) / 1000);

    contador.textContent =
      `${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`;
  }, 1000);
}

function detenerSeguimientoGps() {
  if (gpsWatcherId !== null) {
    navigator.geolocation.clearWatch(gpsWatcherId);
    gpsWatcherId = null;
  }

  if (gpsTimeoutId !== null) {
    clearTimeout(gpsTimeoutId);
    gpsTimeoutId = null;
  }
}

function procesarPosicionGps(posicion, aceptarMargenExtra = false) {
  ubicacionDocente = {
    latitud: posicion.coords.latitude,
    longitud: posicion.coords.longitude,
  };

  precisionGps = posicion.coords.accuracy || 0;

  distanciaCalculada = calcularDistanciaMetros(
    asistenciaActiva.latitud,
    asistenciaActiva.longitud,
    ubicacionDocente.latitud,
    ubicacionDocente.longitud
  );

  const radioBase = Number(asistenciaActiva.radio_metros || 0);
  radioPermitidoFinal = aceptarMargenExtra
    ? radioBase + MARGEN_EXTRA_EXTREMO
    : radioBase;

  return {
    distancia: Math.round(distanciaCalculada),
    precision: Math.round(precisionGps),
    radioBase,
    radioFinal: radioPermitidoFinal,
    dentroDelRadio: distanciaCalculada <= radioBase,
    dentroDelMargenExtra: distanciaCalculada <= radioBase + MARGEN_EXTRA_EXTREMO,
  };
}

async function verificarUbicacionDocente() {
  if (!asistenciaActiva) {
    mostrarToast("No hay asistencia activa en este momento.", "error");
    return;
  }

  if (!navigator.geolocation) {
    mostrarToast("Este dispositivo no permite geolocalización.", "error");
    return;
  }

  detenerSeguimientoGps();

  const estadoUbicacion = document.getElementById("ubicacionEstado");
  const btnEnviar = document.getElementById("btnEnviar");
  const btnUbicacion = document.getElementById("btnVerificarUbicacion");

  ubicacionDocente = null;
  distanciaCalculada = null;
  precisionGps = null;
  radioPermitidoFinal = null;

  btnEnviar.disabled = true;
  btnUbicacion.disabled = true;
  btnUbicacion.classList.remove("success");
  btnUbicacion.textContent = "📍 Verificando ubicación...";

  estadoUbicacion.className = "location-status warning";
  estadoUbicacion.textContent =
    "Buscando ubicación. Apenas esté dentro del rango, se validará automáticamente.";

  let mejorLectura = null;

  gpsWatcherId = navigator.geolocation.watchPosition(
    (posicion) => {
      const resultado = procesarPosicionGps(posicion, false);

      if (!mejorLectura || resultado.distancia < mejorLectura.distancia) {
        mejorLectura = {
          posicion,
          distancia: resultado.distancia,
          precision: resultado.precision,
        };
      }

      estadoUbicacion.className = "location-status warning";
      estadoUbicacion.textContent =
        `Verificando... Distancia aproximada: ${resultado.distancia} m. Radio permitido: ${resultado.radioBase} m.`;

      if (resultado.dentroDelRadio) {
        detenerSeguimientoGps();

        radioPermitidoFinal = resultado.radioBase;

        estadoUbicacion.className = "location-status ok";
        estadoUbicacion.textContent =
          `Ubicación válida. Distancia aproximada: ${resultado.distancia} m.`;

        btnEnviar.disabled = false;
        btnUbicacion.disabled = false;
        btnUbicacion.classList.add("success");
        btnUbicacion.textContent = "✅ Ubicación verificada";

        mostrarToast("Ubicación verificada correctamente.", "success");
      }
    },
    (error) => {
      console.error(error);

      detenerSeguimientoGps();

      estadoUbicacion.className = "location-status error";
      estadoUbicacion.textContent =
        "No se pudo obtener su ubicación. Active el GPS, permita el acceso al navegador y vuelva a intentar.";

      btnEnviar.disabled = true;
      btnUbicacion.disabled = false;
      btnUbicacion.classList.remove("success");
      btnUbicacion.textContent = "📍 Volver a verificar ubicación";

      mostrarToast("No se pudo obtener la ubicación.", "error");
    },
    {
      enableHighAccuracy: true,
      timeout: TIEMPO_MAXIMO_GPS,
      maximumAge: 0,
    }
  );

  gpsTimeoutId = setTimeout(() => {
    detenerSeguimientoGps();

    btnUbicacion.disabled = false;

    if (!mejorLectura) {
      estadoUbicacion.className = "location-status error";
      estadoUbicacion.textContent =
        "No se pudo obtener una lectura de ubicación. Active el GPS y vuelva a intentar.";

      btnEnviar.disabled = true;
      btnUbicacion.textContent = "📍 Volver a verificar ubicación";
      mostrarToast("No se pudo validar la ubicación.", "error");
      return;
    }

    const resultadoFinal = procesarPosicionGps(mejorLectura.posicion, true);

    if (resultadoFinal.dentroDelRadio) {
      radioPermitidoFinal = resultadoFinal.radioBase;

      estadoUbicacion.className = "location-status ok";
      estadoUbicacion.textContent =
        `Ubicación válida. Distancia aproximada: ${resultadoFinal.distancia} m.`;

      btnEnviar.disabled = false;
      btnUbicacion.classList.add("success");
      btnUbicacion.textContent = "✅ Ubicación verificada";

      mostrarToast("Ubicación verificada correctamente.", "success");
      return;
    }

    if (resultadoFinal.dentroDelMargenExtra) {
      radioPermitidoFinal = resultadoFinal.radioFinal;

      estadoUbicacion.className = "location-status ok";
      estadoUbicacion.textContent =
        `Ubicación aceptada. Distancia aproximada: ${resultadoFinal.distancia} m. Margen aplicado: ${MARGEN_EXTRA_EXTREMO} m.`;

      btnEnviar.disabled = false;
      btnUbicacion.classList.add("success");
      btnUbicacion.textContent = "✅ Ubicación aceptada";

      mostrarToast("Ubicación aceptada por margen cercano.", "warning");
      return;
    }

    estadoUbicacion.className = "location-status error";
    estadoUbicacion.textContent =
      `Fuera del rango autorizado. Distancia aproximada: ${resultadoFinal.distancia} m. Radio permitido: ${resultadoFinal.radioBase} m.`;

    btnEnviar.disabled = true;
    btnUbicacion.classList.remove("success");
    btnUbicacion.textContent = "📍 Volver a verificar ubicación";

    mostrarToast("No puede registrar asistencia fuera del rango permitido.", "error");
  }, TIEMPO_MAXIMO_GPS);
}

function validarFormularioDocente() {
  const dni = document.getElementById("dni").value.trim();
  const nombreCompleto = normalizarEspacios(
    document.getElementById("nombreCompleto").value
  ).toUpperCase();
  const departamento = document.getElementById("departamento").value;

  document.getElementById("nombreCompleto").value = nombreCompleto;

  if (!dni || !nombreCompleto || !departamento) {
    mostrarToast("Complete todos los campos obligatorios.", "error");
    return false;
  }

  if (!/^\d{8}$/.test(dni)) {
    mostrarToast("El DNI debe contener exactamente 8 números.", "error");
    return false;
  }

  if (nombreCompleto.length < 5) {
    mostrarToast("Ingrese correctamente sus apellidos y nombres.", "error");
    return false;
  }

  return true;
}

function confirmarDatosAntesDeEnviar(dni, nombreCompleto, departamento) {
  return new Promise((resolve) => {
    const modalExistente = document.getElementById("modalConfirmacionAsistencia");
    if (modalExistente) modalExistente.remove();

    const fondo = document.createElement("div");
    fondo.id = "modalConfirmacionAsistencia";
    fondo.style.position = "fixed";
    fondo.style.top = "0";
    fondo.style.left = "0";
    fondo.style.right = "0";
    fondo.style.bottom = "0";
    fondo.style.background = "rgba(0,0,0,0.55)";
    fondo.style.zIndex = "99999";
    fondo.style.display = "flex";
    fondo.style.alignItems = "center";
    fondo.style.justifyContent = "center";
    fondo.style.padding = "16px";

    fondo.innerHTML = `
      <div style="
        width: 100%;
        max-width: 420px;
        background: #ffffff;
        border-radius: 20px;
        padding: 22px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.35);
        font-family: 'Segoe UI', Arial, sans-serif;
        color: #111827;
      ">
        <h3 style="
          margin: 0 0 16px;
          text-align: center;
          color: #003866;
          font-size: 20px;
          font-weight: 900;
          letter-spacing: 0.4px;
          text-transform: uppercase;
        ">
          Verifique sus datos antes de enviar
        </h3>

        <div style="
          background: #f3f7fb;
          border: 1px solid #d8e3f0;
          border-radius: 16px;
          padding: 14px;
          margin-bottom: 14px;
        ">
          <p style="margin: 0 0 10px; font-size: 15px;">
            <strong style="color:#003866;">DNI:</strong>
            <strong style="color:#000;">${dni}</strong>
          </p>

          <p style="margin: 0 0 10px; font-size: 15px;">
            <strong style="color:#003866;">Apellidos y nombres:</strong><br>
            <strong style="color:#000; font-size: 16px;">${nombreCompleto}</strong>
          </p>

          <p style="margin: 0; font-size: 15px;">
            <strong style="color:#003866;">Departamento académico:</strong><br>
            <strong style="color:#000; font-size: 16px;">${departamento}</strong>
          </p>
        </div>

        <div style="
          background: #fff8d7;
          border: 1px solid #facc15;
          border-radius: 14px;
          padding: 12px;
          margin-bottom: 16px;
          color: #6b4e00;
          font-size: 14px;
          font-weight: 700;
          line-height: 1.4;
        ">
          ⚠️ La información registrada será usada para validar su asistencia y emitir su constancia de capacitación.
        </div>

        <p style="
          margin: 0 0 18px;
          text-align: center;
          font-size: 15px;
          font-weight: 800;
          color: #111827;
        ">
          ¿Está de acuerdo con enviar estos datos?
        </p>

        <div style="display: flex; gap: 10px;">
          <button id="btnCancelarConfirmacion" type="button" style="
            flex: 1;
            height: 46px;
            border: none;
            border-radius: 14px;
            background: #e5e7eb;
            color: #111827;
            font-size: 15px;
            font-weight: 900;
            cursor: pointer;
          ">
            Revisar
          </button>

          <button id="btnAceptarConfirmacion" type="button" style="
            flex: 1;
            height: 46px;
            border: none;
            border-radius: 14px;
            background: linear-gradient(135deg, #003866, #1f5c9d);
            color: #ffffff;
            font-size: 15px;
            font-weight: 900;
            cursor: pointer;
          ">
            Sí, enviar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(fondo);

    document.getElementById("btnCancelarConfirmacion").onclick = () => {
      fondo.remove();
      resolve(false);
    };

    document.getElementById("btnAceptarConfirmacion").onclick = () => {
      fondo.remove();
      resolve(true);
    };
  });
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

  if (!ubicacionDocente || distanciaCalculada === null || radioPermitidoFinal === null) {
    mostrarToast("Primero debe verificar su ubicación.", "error");
    return;
  }

  if (distanciaCalculada > radioPermitidoFinal) {
    mostrarToast("No puede registrar asistencia fuera del rango autorizado.", "error");
    return;
  }

  const dni = document.getElementById("dni").value.trim();

  const nombreCompleto = normalizarEspacios(
    document.getElementById("nombreCompleto").value
  ).toUpperCase();

  const departamento = document.getElementById("departamento").value;

  document.getElementById("nombreCompleto").value = nombreCompleto;

  const confirmar = await confirmarDatosAntesDeEnviar(
    dni,
    nombreCompleto,
    departamento
  );

  if (!confirmar) {
    mostrarToast("Revise sus datos antes de enviar.", "warning");
    return;
  }

  const registro = {
    asistencia_programada_id: asistenciaActiva.id,
    dni: dni,
    nombre_completo: nombreCompleto,
    departamento: departamento,
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
    mostrarToast("No se pudo registrar la asistencia. Intente nuevamente.", "error");
    return;
  }

  registroGuardadoId = data.id;

  mostrarToast("Asistencia enviada correctamente.", "success");
  mostrarEstadoExito("Asistencia enviada correctamente");
  mostrarAvisoConstancia();
  bloquearCamposDespuesDeEnviar();
  mostrarBotonAnular();
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
    .eq("id", registroGuardadoId);

  if (error) {
    console.error(error);
    mostrarToast("No se pudo anular la asistencia.", "error");
    return;
  }

  registroGuardadoId = null;
  ubicacionDocente = null;
  distanciaCalculada = null;
  precisionGps = null;
  radioPermitidoFinal = null;

  detenerSeguimientoGps();

  document.getElementById("ubicacionEstado").className = "location-status";
  document.getElementById("ubicacionEstado").textContent =
    "Primero debe verificar su ubicación.";

  const btnUbicacion = document.getElementById("btnVerificarUbicacion");
  btnUbicacion.classList.remove("success");
  btnUbicacion.textContent = "📍 Pulsar para verificar ubicación";

  ocultarBotonAnular();
  ocultarAvisoConstancia();
  desbloquearFormulario();
  mostrarEstadoActivo("Asistencia habilitada");

  mostrarToast("Asistencia anulada. Puede registrar nuevamente.", "success");
}

function bloquearCamposDespuesDeEnviar() {
  detenerSeguimientoGps();

  document.querySelectorAll("#formDocente input, #formDocente select").forEach((el) => {
    el.disabled = true;
  });

  document.getElementById("btnVerificarUbicacion").disabled = true;
  document.getElementById("btnEnviar").disabled = true;
}

function bloquearTodo() {
  detenerSeguimientoGps();

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