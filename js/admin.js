let ubicacionAdmin = null;
let asistenciaEditandoId = null;

const CLAVE_ELIMINACION = "12345";

document.addEventListener("DOMContentLoaded", () => {
  inicializarMenu();
  cargarAsistenciasProgramadas();

  document.getElementById("btnMarcarUbicacion").addEventListener("click", marcarUbicacionActual);
  document.getElementById("formProgramacion").addEventListener("submit", guardarProgramacion);
  document.getElementById("btnGenerarReporte").addEventListener("click", generarReporteExcel);
  document.getElementById("btnConsultarResultados").addEventListener("click", consultarResultados);
});

function inicializarMenu() {
  const botones = document.querySelectorAll(".menu-btn");
  const secciones = document.querySelectorAll(".panel-section");

  botones.forEach((btn) => {
    btn.addEventListener("click", () => {
      botones.forEach((b) => b.classList.remove("active"));
      secciones.forEach((s) => s.classList.remove("visible"));

      btn.classList.add("active");
      document.getElementById(btn.dataset.section).classList.add("visible");
    });
  });
}

function marcarUbicacionActual() {
  if (!navigator.geolocation) {
    mostrarToast("Este dispositivo no permite geolocalización.", "error");
    return;
  }

  mostrarToast("Solicitando permiso de ubicación...", "warning");

  navigator.geolocation.getCurrentPosition(
    (posicion) => {
      ubicacionAdmin = {
        latitud: posicion.coords.latitude,
        longitud: posicion.coords.longitude,
      };

      document.getElementById("latitudTexto").textContent = ubicacionAdmin.latitud.toFixed(6);
      document.getElementById("longitudTexto").textContent = ubicacionAdmin.longitud.toFixed(6);
      document.getElementById("statUbicacion").textContent = "Capturada";

      mostrarToast("Ubicación capturada correctamente.", "success");
    },
    () => {
      mostrarToast("No se pudo obtener la ubicación. Debe permitir el acceso.", "error");
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    }
  );
}

async function guardarProgramacion(evento) {
  evento.preventDefault();

  if (!ubicacionAdmin) {
    mostrarToast("Primero debe marcar la ubicación actual.", "error");
    return;
  }

  const tipo = document.getElementById("tipo").value;
  const nombre_lugar = document.getElementById("nombreLugar").value.trim();
  const fecha = document.getElementById("fecha").value;
  const hora_inicio = document.getElementById("horaInicio").value;
  const hora_fin = document.getElementById("horaFin").value;
  const radio_metros = Number(document.getElementById("radioMetros").value);

  if (!tipo || !nombre_lugar || !fecha || !hora_inicio || !hora_fin || !radio_metros) {
    mostrarToast("Complete todos los campos obligatorios.", "error");
    return;
  }

  if (hora_inicio >= hora_fin) {
    mostrarToast("La hora de inicio debe ser menor que la hora de fin.", "error");
    return;
  }

  const asistencia = {
    tipo,
    nombre_lugar,
    fecha,
    hora_inicio,
    hora_fin,
    latitud: ubicacionAdmin.latitud,
    longitud: ubicacionAdmin.longitud,
    radio_metros,
    estado: "programada",
  };

  let respuesta;

  if (asistenciaEditandoId) {
    respuesta = await supabaseClient
      .from("asistencias_programadas")
      .update(asistencia)
      .eq("id", asistenciaEditandoId);
  } else {
    respuesta = await supabaseClient
      .from("asistencias_programadas")
      .insert([asistencia]);
  }

  if (respuesta.error) {
    console.error(respuesta.error);
    mostrarToast("Error: " + respuesta.error.message, "error");
    return;
  }

  document.getElementById("statTipo").textContent = tipo;
  document.getElementById("statRadio").textContent = `${radio_metros} m`;
  document.getElementById("statHorario").textContent = `${hora_inicio} - ${hora_fin}`;

  mostrarToast(
    asistenciaEditandoId
      ? "Asistencia actualizada correctamente."
      : "Configuración guardada correctamente.",
    "success"
  );

  asistenciaEditandoId = null;
  document.getElementById("formProgramacion").reset();
  ubicacionAdmin = null;

  document.getElementById("latitudTexto").textContent = "Sin capturar";
  document.getElementById("longitudTexto").textContent = "Sin capturar";

  cargarAsistenciasProgramadas();
}

async function cargarAsistenciasProgramadas() {
  const contenedor = document.getElementById("listaProgramadas");

  const { data, error } = await supabaseClient
    .from("asistencias_programadas")
    .select("*")
    .order("fecha", { ascending: false })
    .order("hora_inicio", { ascending: false });

  if (error) {
    console.error(error);
    contenedor.innerHTML = `<p class="empty-message">No se pudieron cargar las asistencias programadas.</p>`;
    return;
  }

  if (!data || data.length === 0) {
    contenedor.innerHTML = `<p class="empty-message">No hay asistencias programadas todavía.</p>`;
    return;
  }

  contenedor.innerHTML = "";

  for (const asistencia of data) {
    const estadoCalculado = calcularEstadoAsistencia(asistencia);

    const { count } = await supabaseClient
      .from("registros_asistencia")
      .select("*", { count: "exact", head: true })
      .eq("asistencia_programada_id", asistencia.id);

    const card = document.createElement("article");
    card.className = "programada-card";

    card.innerHTML = `
      <div class="programada-head">
        <div>
          <h4>${asistencia.nombre_lugar}</h4>
          <p>${asistencia.fecha} | ${formatearHora(asistencia.hora_inicio)} - ${formatearHora(asistencia.hora_fin)}</p>
        </div>
        <span class="tipo-pill">${asistencia.tipo}</span>
      </div>

      <div class="programada-info">
        <div class="info-box">
          <span>Fecha</span>
          <strong>${asistencia.fecha}</strong>
        </div>

        <div class="info-box">
          <span>Horario</span>
          <strong>${formatearHora(asistencia.hora_inicio)} - ${formatearHora(asistencia.hora_fin)}</strong>
        </div>

        <div class="info-box">
          <span>Radio</span>
          <strong>${asistencia.radio_metros} m</strong>
        </div>

        <div class="info-box">
          <span>Registrados</span>
          <strong>${count || 0}</strong>
        </div>

        <div class="info-box">
          <span>Estado</span>
          <strong>${estadoCalculado}</strong>
        </div>
      </div>

      <div class="actions-row">
        <button class="btn-action edit" onclick="editarAsistencia('${asistencia.id}')">Editar</button>
        <button class="btn-action delete" onclick="eliminarAsistencia('${asistencia.id}')">Eliminar</button>
      </div>
    `;

    contenedor.appendChild(card);
  }
}

async function editarAsistencia(id) {
  const { data, error } = await supabaseClient
    .from("asistencias_programadas")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error(error);
    mostrarToast("No se pudo cargar la asistencia para editar.", "error");
    return;
  }

  asistenciaEditandoId = id;

  document.getElementById("tipo").value = data.tipo;
  document.getElementById("nombreLugar").value = data.nombre_lugar;
  document.getElementById("fecha").value = data.fecha;
  document.getElementById("horaInicio").value = formatearHora(data.hora_inicio);
  document.getElementById("horaFin").value = formatearHora(data.hora_fin);
  document.getElementById("radioMetros").value = data.radio_metros;

  ubicacionAdmin = {
    latitud: data.latitud,
    longitud: data.longitud,
  };

  document.getElementById("latitudTexto").textContent = data.latitud.toFixed(6);
  document.getElementById("longitudTexto").textContent = data.longitud.toFixed(6);

  document.getElementById("statTipo").textContent = data.tipo;
  document.getElementById("statRadio").textContent = `${data.radio_metros} m`;
  document.getElementById("statHorario").textContent = `${formatearHora(data.hora_inicio)} - ${formatearHora(data.hora_fin)}`;
  document.getElementById("statUbicacion").textContent = "Capturada";

  document.querySelector('[data-section="configuracion"]').click();

  mostrarToast("Modo edición activado. Realice los cambios y guarde nuevamente.", "warning");
}

async function eliminarAsistencia(id) {
  const { count, error: errorConteo } = await supabaseClient
    .from("registros_asistencia")
    .select("*", { count: "exact", head: true })
    .eq("asistencia_programada_id", id);

  if (errorConteo) {
    console.error(errorConteo);
    mostrarToast("No se pudo verificar los registros asociados.", "error");
    return;
  }

  const totalRegistros = count || 0;

  if (totalRegistros > 0) {
    const clave = prompt(
      `Esta asistencia tiene ${totalRegistros} registro(s) asociado(s).\n\n` +
      `Para eliminar la asistencia y todos sus registros, ingrese la clave de autorización.`
    );

    if (clave === null) {
      mostrarToast("Eliminación cancelada.", "warning");
      return;
    }

    if (clave !== CLAVE_ELIMINACION) {
      mostrarToast("Clave incorrecta. No se eliminó la asistencia.", "error");
      return;
    }

    const confirmar = confirm(
      `Confirmación final:\n\n` +
      `Se eliminará esta asistencia programada y también ${totalRegistros} registro(s) de docentes.\n\n` +
      `¿Desea continuar?`
    );

    if (!confirmar) {
      mostrarToast("Eliminación cancelada.", "warning");
      return;
    }
  }

  if (totalRegistros > 0) {
    const { error: errorRegistros } = await supabaseClient
      .from("registros_asistencia")
      .delete()
      .eq("asistencia_programada_id", id);

    if (errorRegistros) {
      console.error(errorRegistros);
      mostrarToast("No se pudieron eliminar los registros asociados.", "error");
      return;
    }
  }

  const { error: errorAsistencia } = await supabaseClient
    .from("asistencias_programadas")
    .delete()
    .eq("id", id);

  if (errorAsistencia) {
    console.error(errorAsistencia);
    mostrarToast("No se pudo eliminar la asistencia programada.", "error");
    return;
  }

  if (totalRegistros > 0) {
    mostrarToast("Asistencia y registros asociados eliminados correctamente.", "success");
  } else {
    mostrarToast("Asistencia eliminada correctamente.", "success");
  }

  cargarAsistenciasProgramadas();
}

async function consultarResultados() {
  const fecha = document.getElementById("resultadoFecha").value;
  const tipo = document.getElementById("resultadoTipo").value;
  const contenedor = document.getElementById("dashboardResultados");
  const totalTexto = document.getElementById("resultadoTotal");

  if (!fecha || !tipo) {
    mostrarToast("Seleccione una fecha y un tipo de asistencia.", "warning");
    return;
  }

  contenedor.innerHTML = `<p class="empty-message">Consultando resultados...</p>`;
  totalTexto.textContent = "0";

  const { data, error } = await supabaseClient
    .from("registros_asistencia")
    .select(`
      departamento,
      asistencias_programadas (
        fecha,
        tipo
      )
    `);

  if (error) {
    console.error(error);
    mostrarToast("No se pudieron consultar los resultados.", "error");
    contenedor.innerHTML = `<p class="empty-message">Error al cargar los resultados.</p>`;
    return;
  }

  const registrosFiltrados = (data || []).filter((registro) => {
    return (
      registro.asistencias_programadas?.fecha === fecha &&
      registro.asistencias_programadas?.tipo === tipo
    );
  });

  if (!registrosFiltrados.length) {
    contenedor.innerHTML = `
      <p class="empty-message">
        No existen registros para la fecha y tipo de asistencia seleccionados.
      </p>
    `;
    totalTexto.textContent = "0";
    mostrarToast("No se encontraron registros con esos filtros.", "warning");
    return;
  }

  const conteo = {};

  registrosFiltrados.forEach((registro) => {
    const departamento = registro.departamento || "Sin departamento";
    conteo[departamento] = (conteo[departamento] || 0) + 1;
  });

  const departamentos = Object.entries(conteo).sort((a, b) => b[1] - a[1]);

  totalTexto.textContent = registrosFiltrados.length;

  contenedor.innerHTML = departamentos.map(([departamento, cantidad]) => `
    <div class="department-card">
      <span>${departamento}</span>
      <strong>${cantidad}</strong>
    </div>
  `).join("");

  mostrarToast("Resultados cargados correctamente.", "success");
}

async function generarReporteExcel() {
  const fecha = document.getElementById("reporteFecha").value;
  const tipo = document.getElementById("reporteTipo").value;

  const { data, error } = await supabaseClient
    .from("registros_asistencia")
    .select(`
      dni,
      nombres,
      apellido_paterno,
      apellido_materno,
      celular,
      correo,
      departamento,
      distancia_metros,
      fecha_registro,
      asistencias_programadas (
        tipo,
        nombre_lugar,
        fecha,
        hora_inicio,
        hora_fin
      )
    `);

  if (error) {
    console.error(error);
    mostrarToast("No se pudo generar el reporte.", "error");
    return;
  }

  let registros = data || [];

  if (fecha) {
    registros = registros.filter(r => r.asistencias_programadas?.fecha === fecha);
  }

  if (tipo) {
    registros = registros.filter(r => r.asistencias_programadas?.tipo === tipo);
  }

  if (!registros.length) {
    mostrarToast("No existen registros para los filtros seleccionados.", "warning");
    return;
  }

  const filas = registros.map((r) => ({
    DNI: r.dni,
    Nombres: r.nombres,
    "Apellido paterno": r.apellido_paterno,
    "Apellido materno": r.apellido_materno,
    Celular: r.celular,
    Correo: r.correo,
    Departamento: r.departamento,
    Tipo: r.asistencias_programadas?.tipo,
    Lugar: r.asistencias_programadas?.nombre_lugar,
    Fecha: r.asistencias_programadas?.fecha,
    "Hora inicio": r.asistencias_programadas?.hora_inicio,
    "Hora fin": r.asistencias_programadas?.hora_fin,
    "Distancia metros": Math.round(r.distancia_metros),
    "Fecha registro": r.fecha_registro,
  }));

  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(libro, hoja, "Reporte Asistencia");
  XLSX.writeFile(libro, "reporte_asistencia_docente.xlsx");

  mostrarToast("Reporte Excel generado correctamente.", "success");
}