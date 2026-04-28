document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnOpcionDia")?.addEventListener("click", () => {
    cambiarOpcionReporte("dia");
  });

  document.getElementById("btnOpcionGeneral")?.addEventListener("click", () => {
    cambiarOpcionReporte("general");
  });

  document.getElementById("btnReporteEntrada")?.addEventListener("click", () => {
    generarReportePorDia("entrada");
  });

  document.getElementById("btnReporteSalida")?.addEventListener("click", () => {
    generarReportePorDia("salida");
  });

  document.getElementById("btnReporteDiaGeneral")?.addEventListener("click", () => {
    generarReportePorDia("general");
  });

  document.getElementById("btnDescargarGeneral")?.addEventListener("click", generarReporteGeneral);
});

function cambiarOpcionReporte(tipo) {
  const btnDia = document.getElementById("btnOpcionDia");
  const btnGeneral = document.getElementById("btnOpcionGeneral");
  const seccionDia = document.getElementById("seccionDia");
  const seccionGeneral = document.getElementById("seccionGeneral");

  btnDia.classList.remove("active");
  btnGeneral.classList.remove("active");
  seccionDia.classList.remove("visible");
  seccionGeneral.classList.remove("visible");

  if (tipo === "dia") {
    btnDia.classList.add("active");
    seccionDia.classList.add("visible");
  } else {
    btnGeneral.classList.add("active");
    seccionGeneral.classList.add("visible");
  }
}

async function generarReportePorDia(tipoSeleccionado) {
  const fecha = document.getElementById("fechaReporteDia").value;

  if (!fecha) {
    mostrarToast("Seleccione una fecha.", "warning");
    return;
  }

  mostrarToast("Generando reporte...", "warning");

  let consulta = supabaseClient
    .from("asistencias_programadas")
    .select("id, tipo, fecha")
    .eq("fecha", fecha);

  if (tipoSeleccionado === "entrada" || tipoSeleccionado === "salida") {
    consulta = consulta.eq("tipo", tipoSeleccionado);
  }

  const { data: asistencias, error } = await consulta;

  if (error) {
    console.error(error);
    mostrarToast("Error al consultar asistencias programadas.", "error");
    return;
  }

  if (!asistencias || asistencias.length === 0) {
    mostrarToast("No hay asistencias programadas para ese filtro.", "warning");
    return;
  }

  const idsAsistencias = asistencias.map((a) => a.id);

  let nombreArchivo = "";

  if (tipoSeleccionado === "entrada") {
    nombreArchivo = `reporte_entrada_${fecha}.xlsx`;
  } else if (tipoSeleccionado === "salida") {
    nombreArchivo = `reporte_salida_${fecha}.xlsx`;
  } else {
    nombreArchivo = `reporte_general_dia_${fecha}.xlsx`;
  }

  await generarExcelDesdeAsistencias(
    idsAsistencias,
    nombreArchivo,
    normalizarTipo(tipoSeleccionado)
  );
}

async function generarReporteGeneral() {
  mostrarToast("Generando reporte general...", "warning");

  const { data: asistencias, error } = await supabaseClient
    .from("asistencias_programadas")
    .select("id");

  if (error) {
    console.error(error);
    mostrarToast("Error al consultar asistencias programadas.", "error");
    return;
  }

  if (!asistencias || asistencias.length === 0) {
    mostrarToast("No hay asistencias programadas.", "warning");
    return;
  }

  const idsAsistencias = asistencias.map((a) => a.id);

  await generarExcelDesdeAsistencias(
    idsAsistencias,
    "reporte_general_todos_los_dias.xlsx",
    "General"
  );
}

async function generarExcelDesdeAsistencias(idsAsistencias, nombreArchivo, tipoReporte) {
  if (typeof XLSX === "undefined") {
    alert("No se cargó la librería de Excel. Revise el script XLSX en reportes.html.");
    return;
  }

  if (typeof supabaseClient === "undefined") {
    alert("No se cargó Supabase. Revise que js/supabase.js esté antes de js/reportes.js.");
    return;
  }

  const totalProgramadas = idsAsistencias.length;

  const { data: registros, error } = await supabaseClient
    .from("registros_asistencia")
    .select(`
      dni,
      correo,
      nombres,
      apellido_paterno,
      apellido_materno,
      asistencia_programada_id
    `)
    .in("asistencia_programada_id", idsAsistencias);

  if (error) {
    console.error(error);
    mostrarToast("Error al consultar registros de asistencia.", "error");
    return;
  }

  if (!registros || registros.length === 0) {
    mostrarToast("No existen registros de asistencia para este reporte.", "warning");
    return;
  }

  const docentes = {};

  registros.forEach((registro) => {
    const dni = limpiarTexto(registro.dni);

    if (!dni) return;

    if (!docentes[dni]) {
      docentes[dni] = {
        dni: dni,
        correo: limpiarTexto(registro.correo),
        apellido_paterno: limpiarTexto(registro.apellido_paterno),
        apellido_materno: limpiarTexto(registro.apellido_materno),
        nombres: limpiarTexto(registro.nombres),
        asistenciasMarcadas: new Set(),
      };
    }

    if (!docentes[dni].correo && registro.correo) {
      docentes[dni].correo = limpiarTexto(registro.correo);
    }

    docentes[dni].asistenciasMarcadas.add(registro.asistencia_programada_id);
  });

  const filas = Object.values(docentes)
    .sort((a, b) => {
      const paternoA = a.apellido_paterno || "";
      const paternoB = b.apellido_paterno || "";
      return paternoA.localeCompare(paternoB);
    })
    .map((docente) => {
      const totalMarcadas = docente.asistenciasMarcadas.size;
      const porcentaje = (totalMarcadas / totalProgramadas) * 100;

      return {
        "Tipo": tipoReporte,
        "DNI": docente.dni,
        "Correo electrónico": docente.correo,
        "Apellido paterno": docente.apellido_paterno,
        "Apellido materno": docente.apellido_materno,
        "Nombre": docente.nombres,
        "Asistencias registradas": `${totalMarcadas}/${totalProgramadas}`,
        "Porcentaje de asistencia": `${porcentaje.toFixed(2)}%`,
      };
    });

  if (filas.length === 0) {
    mostrarToast("No hay docentes válidos para exportar.", "warning");
    return;
  }

  const hoja = XLSX.utils.json_to_sheet(filas);

  hoja["!cols"] = [
    { wch: 14 },
    { wch: 14 },
    { wch: 36 },
    { wch: 24 },
    { wch: 24 },
    { wch: 30 },
    { wch: 24 },
    { wch: 26 },
  ];

  hoja["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: filas.length, c: 7 },
    }),
  };

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Reporte");

  descargarExcel(libro, nombreArchivo);
}

function descargarExcel(libro, nombreArchivo) {
  try {
    const excelBuffer = XLSX.write(libro, {
      bookType: "xlsx",
      type: "array",
    });

    const archivo = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement("a");

    enlace.href = url;
    enlace.download = nombreArchivo;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);

    URL.revokeObjectURL(url);

    mostrarToast("Reporte Excel descargado correctamente.", "success");
  } catch (error) {
    console.error(error);
    alert("No se pudo descargar el Excel. Revise la consola del navegador.");
  }
}

function normalizarTipo(tipo) {
  if (tipo === "entrada") return "Entrada";
  if (tipo === "salida") return "Salida";
  return "General";
}

function limpiarTexto(valor) {
  return String(valor || "").trim();
}

function mostrarToast(mensaje, tipo = "success") {
  const toast = document.getElementById("toast");

  if (!toast) {
    alert(mensaje);
    return;
  }

  toast.textContent = mensaje;
  toast.className = `toast show ${tipo}`;

  setTimeout(() => {
    toast.className = "toast";
  }, 3500);
}