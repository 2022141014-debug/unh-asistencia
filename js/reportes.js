document.getElementById("tabDia").onclick = () => cambiarPanel("dia");
document.getElementById("tabGeneral").onclick = () => cambiarPanel("general");

function cambiarPanel(tipo) {
  document.getElementById("panelDia").classList.toggle("active", tipo === "dia");
  document.getElementById("panelGeneral").classList.toggle("active", tipo === "general");

  document.getElementById("tabDia").classList.toggle("active", tipo === "dia");
  document.getElementById("tabGeneral").classList.toggle("active", tipo === "general");
}

async function reporteDia(tipo) {
  const fecha = document.getElementById("fechaDia").value;

  if (!fecha) {
    mostrarToast("Seleccione una fecha.", "warning");
    return;
  }

  mostrarToast("Generando reporte...", "warning");

  let consulta = supabaseClient
    .from("asistencias_programadas")
    .select("id, tipo, fecha")
    .eq("fecha", fecha);

  if (tipo !== "general") {
    consulta = consulta.eq("tipo", tipo);
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

  const ids = asistencias.map((a) => a.id);

  const { data: registros, error: errorRegistros } = await supabaseClient
    .from("registros_asistencia")
    .select(`
      dni,
      nombre_completo,
      departamento,
      correo,
      asistencia_programada_id
    `)
    .in("asistencia_programada_id", ids);

  if (errorRegistros) {
    console.error(errorRegistros);
    mostrarToast("Error al consultar registros.", "error");
    return;
  }

  if (!registros || registros.length === 0) {
    mostrarToast("No existen registros para este reporte.", "warning");
    return;
  }

  if (tipo === "general") {
    generarExcelGeneralDia(asistencias, registros, fecha);
  } else {
    generarExcelEntradaSalida(asistencias, registros, tipo, fecha);
  }
}

function generarExcelEntradaSalida(asistencias, registros, tipo, fecha) {
  const totalProgramadas = asistencias.length;
  const mapa = {};

  registros.forEach((r) => {
    const dni = limpiarTexto(r.dni);
    if (!dni) return;

    if (!mapa[dni]) {
      mapa[dni] = {
        tipo: normalizarTipo(tipo),
        departamento: mayuscula(r.departamento),
        dni: dni,
        nombreCompleto: mayuscula(r.nombre_completo),
        asistenciasMarcadas: new Set(),
      };
    }

    mapa[dni].asistenciasMarcadas.add(r.asistencia_programada_id);
  });

  const filas = Object.values(mapa).map((d) => {
    const marcadas = d.asistenciasMarcadas.size;
    const porcentaje = totalProgramadas > 0 ? (marcadas / totalProgramadas) * 100 : 0;

    return {
      "Tipo": d.tipo,
      "Departamento académico": d.departamento,
      "DNI": d.dni,
      "Nombre completo": d.nombreCompleto,
      "Asistencias registradas": `${marcadas}/${totalProgramadas}`,
      "Porcentaje": `${porcentaje.toFixed(2)}%`,
    };
  });

  exportarExcel(filas, `reporte_${tipo}_${fecha}.xlsx`);
}

function generarExcelGeneralDia(asistencias, registros, fecha) {
  const tipoPorId = {};
  let totalEntrada = 0;
  let totalSalida = 0;

  asistencias.forEach((a) => {
    const tipo = limpiarTexto(a.tipo).toLowerCase();
    tipoPorId[a.id] = tipo;

    if (tipo === "entrada") totalEntrada++;
    if (tipo === "salida") totalSalida++;
  });

  const totalProgramadas = asistencias.length;
  const mapa = {};

  registros.forEach((r) => {
    const dni = limpiarTexto(r.dni);
    const tipo = tipoPorId[r.asistencia_programada_id];

    if (!dni || !tipo) return;

    if (!mapa[dni]) {
      mapa[dni] = {
        departamento: mayuscula(r.departamento),
        dni: dni,
        nombreCompleto: mayuscula(r.nombre_completo),
        entrada: new Set(),
        salida: new Set(),
      };
    }

    if (tipo === "entrada") {
      mapa[dni].entrada.add(r.asistencia_programada_id);
    }

    if (tipo === "salida") {
      mapa[dni].salida.add(r.asistencia_programada_id);
    }
  });

  const filas = Object.values(mapa).map((d) => {
    const entradaMarcada = d.entrada.size;
    const salidaMarcada = d.salida.size;
    const totalMarcado = entradaMarcada + salidaMarcada;
    const porcentaje = totalProgramadas > 0 ? (totalMarcado / totalProgramadas) * 100 : 0;

    return {
      "Departamento académico": d.departamento,
      "DNI": d.dni,
      "Nombre completo": d.nombreCompleto,
      "Entrada": `${entradaMarcada}/${totalEntrada}`,
      "Salida": `${salidaMarcada}/${totalSalida}`,
      "Porcentaje": `${porcentaje.toFixed(2)}%`,
    };
  });

  exportarExcel(filas, `reporte_general_dia_${fecha}.xlsx`);
}

async function reporteRango() {
  const inicio = document.getElementById("fechaInicio").value;
  const fin = document.getElementById("fechaFin").value;

  if (!inicio || !fin) {
    mostrarToast("Seleccione fecha inicial y fecha final.", "warning");
    return;
  }

  if (inicio > fin) {
    mostrarToast("La fecha inicial no puede ser mayor que la fecha final.", "warning");
    return;
  }

  mostrarToast("Generando reporte general...", "warning");

  const { data: asistencias, error } = await supabaseClient
    .from("asistencias_programadas")
    .select("id, tipo, fecha")
    .gte("fecha", inicio)
    .lte("fecha", fin);

  if (error) {
    console.error(error);
    mostrarToast("Error al consultar asistencias programadas.", "error");
    return;
  }

  if (!asistencias || asistencias.length === 0) {
    mostrarToast("No hay asistencias programadas en ese rango.", "warning");
    return;
  }

  const ids = asistencias.map((a) => a.id);

  const { data: registros, error: errorRegistros } = await supabaseClient
    .from("registros_asistencia")
    .select(`
      dni,
      nombre_completo,
      departamento,
      correo,
      asistencia_programada_id
    `)
    .in("asistencia_programada_id", ids);

  if (errorRegistros) {
    console.error(errorRegistros);
    mostrarToast("Error al consultar registros.", "error");
    return;
  }

  if (!registros || registros.length === 0) {
    mostrarToast("No existen registros para ese rango.", "warning");
    return;
  }

  const totalProgramadas = asistencias.length;
  const mapa = {};

  registros.forEach((r) => {
    const dni = limpiarTexto(r.dni);
    if (!dni) return;

    if (!mapa[dni]) {
      mapa[dni] = {
        departamento: mayuscula(r.departamento),
        dni: dni,
        nombreCompleto: mayuscula(r.nombre_completo),
        asistenciasMarcadas: new Set(),
      };
    }

    mapa[dni].asistenciasMarcadas.add(r.asistencia_programada_id);
  });

  const filas = Object.values(mapa).map((d) => {
    const marcadas = d.asistenciasMarcadas.size;
    const porcentaje = totalProgramadas > 0 ? (marcadas / totalProgramadas) * 100 : 0;

    return {
      "Departamento académico": d.departamento,
      "DNI": d.dni,
      "Nombre completo": d.nombreCompleto,
      "Asistencias registradas": `${marcadas}/${totalProgramadas}`,
      "Porcentaje": `${porcentaje.toFixed(2)}%`,
      "Estado": porcentaje >= 80 ? "APROBADO" : "DESAPROBADO",
    };
  });

  exportarExcel(filas, `reporte_general_${inicio}_a_${fin}.xlsx`);
}

function exportarExcel(filas, nombreArchivo) {
  if (!filas || filas.length === 0) {
    mostrarToast("No hay datos para exportar.", "warning");
    return;
  }

  const hoja = XLSX.utils.json_to_sheet(filas);

  hoja["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: filas.length, c: Object.keys(filas[0]).length - 1 },
    }),
  };

  hoja["!cols"] = Object.keys(filas[0]).map((columna) => ({
    wch: Math.max(18, columna.length + 8),
  }));

  aplicarEstiloEstado(hoja, filas);

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Reporte");

  try {
    XLSX.writeFile(libro, nombreArchivo);
    mostrarToast("Excel descargado correctamente.", "success");
  } catch (error) {
    console.error(error);
    alert("No se pudo descargar el Excel.");
  }
}

function aplicarEstiloEstado(hoja, filas) {
  if (!filas || filas.length === 0) return;

  const columnas = Object.keys(filas[0]);
  const indiceEstado = columnas.indexOf("Estado");

  if (indiceEstado === -1) return;

  for (let i = 0; i < filas.length; i++) {
    const celda = XLSX.utils.encode_cell({
      r: i + 1,
      c: indiceEstado,
    });

    if (!hoja[celda]) continue;

    const valor = String(hoja[celda].v || "").toUpperCase();

    if (valor === "APROBADO") {
      hoja[celda].s = {
        fill: {
          fgColor: { rgb: "C6EFCE" },
        },
        font: {
          color: { rgb: "006100" },
          bold: true,
        },
      };
    }

    if (valor === "DESAPROBADO") {
      hoja[celda].s = {
        fill: {
          fgColor: { rgb: "FFC7CE" },
        },
        font: {
          color: { rgb: "9C0006" },
          bold: true,
        },
      };
    }
  }
}

function normalizarTipo(tipo) {
  const valor = limpiarTexto(tipo).toLowerCase();

  if (valor === "entrada") return "ENTRADA";
  if (valor === "salida") return "SALIDA";

  return "GENERAL";
}

function limpiarTexto(valor) {
  return String(valor || "").trim();
}

function mayuscula(valor) {
  return limpiarTexto(valor).toUpperCase();
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