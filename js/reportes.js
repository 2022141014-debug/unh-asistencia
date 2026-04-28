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
    generarReporteGeneralDelDia();
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

  const { data: asistencias, error } = await supabaseClient
    .from("asistencias_programadas")
    .select("id, tipo, fecha")
    .eq("fecha", fecha)
    .eq("tipo", tipoSeleccionado);

  if (error) {
    console.error(error);
    mostrarToast("Error al consultar asistencias programadas.", "error");
    return;
  }

  if (!asistencias || asistencias.length === 0) {
    mostrarToast("No hay asistencias programadas para ese filtro.", "warning");
    return;
  }

  const nombreArchivo =
    tipoSeleccionado === "entrada"
      ? `reporte_entrada_${fecha}.xlsx`
      : `reporte_salida_${fecha}.xlsx`;

  await generarExcelEntradaSalida(asistencias, nombreArchivo);
}

async function generarReporteGeneralDelDia() {
  const fecha = document.getElementById("fechaReporteDia").value;

  if (!fecha) {
    mostrarToast("Seleccione una fecha.", "warning");
    return;
  }

  mostrarToast("Generando reporte general del día...", "warning");

  const { data: asistencias, error } = await supabaseClient
    .from("asistencias_programadas")
    .select("id, tipo, fecha")
    .eq("fecha", fecha);

  if (error) {
    console.error(error);
    mostrarToast("Error al consultar asistencias programadas.", "error");
    return;
  }

  if (!asistencias || asistencias.length === 0) {
    mostrarToast("No hay asistencias programadas para esa fecha.", "warning");
    return;
  }

  await generarExcelGeneralDia(
    asistencias,
    `reporte_general_dia_${fecha}.xlsx`
  );
}

async function generarReporteGeneral() {
  mostrarToast("Generando reporte general...", "warning");

  const { data: asistencias, error } = await supabaseClient
    .from("asistencias_programadas")
    .select("id, tipo");

  if (error) {
    console.error(error);
    mostrarToast("Error al consultar asistencias programadas.", "error");
    return;
  }

  if (!asistencias || asistencias.length === 0) {
    mostrarToast("No hay asistencias programadas.", "warning");
    return;
  }

  await generarExcelEntradaSalida(
    asistencias,
    "reporte_general_todos_los_dias.xlsx"
  );
}

async function generarExcelEntradaSalida(asistencias, nombreArchivo) {
  if (!validarDependencias()) return;

  const idsAsistencias = asistencias.map((a) => a.id);

  const tipoPorAsistencia = {};
  const totalProgramadasPorTipo = {
    entrada: 0,
    salida: 0,
  };

  asistencias.forEach((asistencia) => {
    const tipo = limpiarTexto(asistencia.tipo).toLowerCase();

    tipoPorAsistencia[asistencia.id] = tipo;

    if (tipo === "entrada" || tipo === "salida") {
      totalProgramadasPorTipo[tipo]++;
    }
  });

  const { data: registros, error } = await supabaseClient
    .from("registros_asistencia")
    .select(`
      dni,
      correo,
      nombres,
      apellido_paterno,
      apellido_materno,
      departamento,
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
    const tipo = tipoPorAsistencia[registro.asistencia_programada_id];

    if (!dni || !tipo) return;

    const clave = `${dni}_${tipo}`;

    if (!docentes[clave]) {
      docentes[clave] = {
        tipo,
        departamento: limpiarTexto(registro.departamento),
        dni,
        correo: limpiarTexto(registro.correo),
        apellido_paterno: limpiarTexto(registro.apellido_paterno),
        apellido_materno: limpiarTexto(registro.apellido_materno),
        nombres: limpiarTexto(registro.nombres),
        asistenciasMarcadas: new Set(),
      };
    }

    if (!docentes[clave].correo && registro.correo) {
      docentes[clave].correo = limpiarTexto(registro.correo);
    }

    if (!docentes[clave].departamento && registro.departamento) {
      docentes[clave].departamento = limpiarTexto(registro.departamento);
    }

    docentes[clave].asistenciasMarcadas.add(registro.asistencia_programada_id);
  });

  const filas = Object.values(docentes)
    .sort((a, b) => {
      const tipoComparado = a.tipo.localeCompare(b.tipo);
      if (tipoComparado !== 0) return tipoComparado;

      return (a.apellido_paterno || "").localeCompare(b.apellido_paterno || "");
    })
    .map((docente) => {
      const totalMarcadas = docente.asistenciasMarcadas.size;
      const totalProgramadas = totalProgramadasPorTipo[docente.tipo] || 0;
      const porcentaje = totalProgramadas > 0
        ? (totalMarcadas / totalProgramadas) * 100
        : 0;

      return {
        "Tipo": normalizarTipo(docente.tipo),
        "Departamento académico": docente.departamento,
        "DNI": docente.dni,
        "Correo electrónico": docente.correo,
        "Apellido paterno": docente.apellido_paterno,
        "Apellido materno": docente.apellido_materno,
        "Nombre": docente.nombres,
        "Asistencias registradas": `${totalMarcadas}/${totalProgramadas}`,
        "Porcentaje de asistencia": `${porcentaje.toFixed(2)}%`,
      };
    });

  exportarExcel(filas, nombreArchivo, [
    { wch: 14 },
    { wch: 30 },
    { wch: 14 },
    { wch: 36 },
    { wch: 24 },
    { wch: 24 },
    { wch: 30 },
    { wch: 24 },
    { wch: 26 },
  ]);
}

async function generarExcelGeneralDia(asistencias, nombreArchivo) {
  if (!validarDependencias()) return;

  const idsAsistencias = asistencias.map((a) => a.id);

  const tipoPorAsistencia = {};
  const totalEntrada = asistencias.filter((a) => limpiarTexto(a.tipo).toLowerCase() === "entrada").length;
  const totalSalida = asistencias.filter((a) => limpiarTexto(a.tipo).toLowerCase() === "salida").length;
  const totalProgramadas = asistencias.length;

  asistencias.forEach((asistencia) => {
    tipoPorAsistencia[asistencia.id] = limpiarTexto(asistencia.tipo).toLowerCase();
  });

  const { data: registros, error } = await supabaseClient
    .from("registros_asistencia")
    .select(`
      dni,
      correo,
      nombres,
      apellido_paterno,
      apellido_materno,
      departamento,
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
    const tipo = tipoPorAsistencia[registro.asistencia_programada_id];

    if (!dni || !tipo) return;

    if (!docentes[dni]) {
      docentes[dni] = {
        dni,
        departamento: limpiarTexto(registro.departamento),
        apellido_paterno: limpiarTexto(registro.apellido_paterno),
        apellido_materno: limpiarTexto(registro.apellido_materno),
        correo: limpiarTexto(registro.correo),
        entradaMarcadas: new Set(),
        salidaMarcadas: new Set(),
      };
    }

    if (!docentes[dni].correo && registro.correo) {
      docentes[dni].correo = limpiarTexto(registro.correo);
    }

    if (!docentes[dni].departamento && registro.departamento) {
      docentes[dni].departamento = limpiarTexto(registro.departamento);
    }

    if (tipo === "entrada") {
      docentes[dni].entradaMarcadas.add(registro.asistencia_programada_id);
    }

    if (tipo === "salida") {
      docentes[dni].salidaMarcadas.add(registro.asistencia_programada_id);
    }
  });

  const filas = Object.values(docentes)
    .sort((a, b) => {
      return (a.apellido_paterno || "").localeCompare(b.apellido_paterno || "");
    })
    .map((docente) => {
      const marcadasEntrada = docente.entradaMarcadas.size;
      const marcadasSalida = docente.salidaMarcadas.size;
      const totalMarcadas = marcadasEntrada + marcadasSalida;
      const porcentaje = totalProgramadas > 0
        ? (totalMarcadas / totalProgramadas) * 100
        : 0;

      return {
        "DNI": docente.dni,
        "Departamento académico": docente.departamento,
        "Apellido paterno": docente.apellido_paterno,
        "Apellido materno": docente.apellido_materno,
        "Correo electrónico": docente.correo,
        "Entrada": `${marcadasEntrada}/${totalEntrada}`,
        "Salida": `${marcadasSalida}/${totalSalida}`,
        "Porcentaje de asistencia": `${porcentaje.toFixed(2)}%`,
      };
    });

  exportarExcel(filas, nombreArchivo, [
    { wch: 14 },
    { wch: 30 },
    { wch: 24 },
    { wch: 24 },
    { wch: 36 },
    { wch: 16 },
    { wch: 16 },
    { wch: 26 },
  ]);
}

function exportarExcel(filas, nombreArchivo, columnas) {
  if (!filas || filas.length === 0) {
    mostrarToast("No hay datos válidos para exportar.", "warning");
    return;
  }

  const hoja = XLSX.utils.json_to_sheet(filas);

  hoja["!cols"] = columnas;

  hoja["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: filas.length, c: Object.keys(filas[0]).length - 1 },
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

function validarDependencias() {
  if (typeof XLSX === "undefined") {
    alert("No se cargó la librería de Excel. Revise el script XLSX en reportes.html.");
    return false;
  }

  if (typeof supabaseClient === "undefined") {
    alert("No se cargó Supabase. Revise que js/supabase.js esté antes de js/reportes.js.");
    return false;
  }

  return true;
}

function normalizarTipo(tipo) {
  const valor = limpiarTexto(tipo).toLowerCase();

  if (valor === "entrada") return "Entrada";
  if (valor === "salida") return "Salida";

  return valor;
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