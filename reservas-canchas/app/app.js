/* =====================================================================
   RESERVA DE CANCHAS - Lógica con Programación Orientada a Objetos
   Clases: Turno (un turno) -> GestorReservas (todos los turnos) -> Interfaz (pantalla)
   ===================================================================== */
"use strict";

/* ---------- Datos fijos del complejo ---------- */
const CANCHAS = {
  "Cancha 1": { deporte: "Fútbol 5", precioHora: 20000 },
  "Cancha 2": { deporte: "Pádel",    precioHora: 12000 },
  "Cancha 3": { deporte: "Tenis",    precioHora: 9000 },
};
const APERTURA = 8 * 60;   // 08:00 expresado en minutos desde las 00:00
const CIERRE   = 23 * 60;  // 23:00: ningún turno puede terminar después

const aMinutos = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const aHora = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const pesos = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

/* =====================================================================
   CLASE Turno
   Representa UNA reserva. Sus datos son privados (#) y solo se leen o
   modifican mediante getters/setters, que validan antes de aceptar un valor.
   ===================================================================== */
class Turno {
  static ESTADOS = ["pendiente", "confirmado", "pagado", "cancelado"];

  // Campos privados: desde afuera NO se puede hacer turno.#senia = -5
  #id; #cancha; #responsable; #fecha; #horaInicio; #duracion; #senia; #estado;

  constructor({ id, cancha, responsable, fecha, horaInicio, duracion, senia = 0, estado = "pendiente" }) {
    this.#id = id ?? (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
    // El orden importa: la seña se valida contra el total (que depende de cancha y duración)
    this.cancha = cancha;
    this.responsable = responsable;
    this.fecha = fecha;
    this.duracion = duracion;
    this.horaInicio = horaInicio;
    this.senia = senia;
    this.estado = estado;
  }

  /* ----- Getters y setters (con validaciones reales) ----- */
  get id() { return this.#id; } // solo lectura: no tiene setter

  get cancha() { return this.#cancha; }
  set cancha(valor) {
    if (!CANCHAS[valor]) throw new Error("Elegí una cancha válida.");
    this.#cancha = valor;
  }

  get responsable() { return this.#responsable; }
  set responsable(valor) {
    const nombre = String(valor ?? "").trim();
    if (nombre.length < 2) throw new Error("El nombre del responsable no puede estar vacío (mínimo 2 letras).");
    this.#responsable = nombre;
  }

  get fecha() { return this.#fecha; }
  set fecha(valor) {
    // Formato AAAA-MM-DD y que sea una fecha real (rechaza 2026-02-31)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number.isNaN(Date.parse(valor))) throw new Error("La fecha no es válida.");
    this.#fecha = valor;
  }

  get horaInicio() { return this.#horaInicio; }
  set horaInicio(valor) {
    if (!/^\d{2}:\d{2}$/.test(valor)) throw new Error("El horario no es válido.");
    const min = aMinutos(valor);
    if (min < APERTURA || min >= CIERRE) throw new Error("El complejo abre de 08:00 a 23:00.");
    this.#horaInicio = valor;
    this.#validarFin();
  }

  get duracion() { return this.#duracion; } // en minutos
  set duracion(valor) {
    const min = Number(valor);
    if (![60, 90, 120].includes(min)) throw new Error("La duración debe ser 60, 90 o 120 minutos.");
    this.#duracion = min;
    this.#validarFin();
  }

  get senia() { return this.#senia; }
  set senia(valor) {
    const monto = Number(valor);
    if (!Number.isFinite(monto) || monto < 0) throw new Error("La seña no puede ser negativa.");
    if (monto > this.total) throw new Error(`La seña no puede superar el total (${pesos(this.total)}).`);
    this.#senia = monto;
  }

  get estado() { return this.#estado; }
  set estado(valor) {
    if (!Turno.ESTADOS.includes(valor)) throw new Error("Estado inválido.");
    this.#estado = valor;
  }

  /* ----- Propiedades calculadas (no se guardan, se derivan de otras) ----- */
  get total()  { return CANCHAS[this.#cancha].precioHora * (this.#duracion / 60); }
  get saldo()  { return this.total - this.#senia; }
  get inicioMin() { return aMinutos(this.#horaInicio); }
  get finMin()    { return this.inicioMin + this.#duracion; }
  get horaFin()   { return aHora(this.finMin); }
  get activo()    { return this.#estado !== "cancelado"; } // los cancelados liberan el horario

  /* ----- Métodos propios del turno ----- */
  confirmar()    { if (this.#estado === "pendiente") this.#estado = "confirmado"; }
  marcarPagado() { if (!this.activo) throw new Error("Un turno cancelado no se puede cobrar."); this.#senia = this.total; this.#estado = "pagado"; }
  cancelar()     { this.#estado = "cancelado"; }

  /** ¿Este turno se superpone con otro? (misma cancha, mismo día, horarios que se cruzan) */
  solapaCon(otro) {
    return this.#cancha === otro.cancha && this.#fecha === otro.fecha &&
           this.inicioMin < otro.finMin && otro.inicioMin < this.finMin;
  }

  /** Convierte el turno a objeto simple para guardarlo como JSON en localStorage */
  toJSON() {
    return { id: this.#id, cancha: this.#cancha, responsable: this.#responsable, fecha: this.#fecha,
             horaInicio: this.#horaInicio, duracion: this.#duracion, senia: this.#senia, estado: this.#estado };
  }

  // Privado: el turno no puede terminar después del cierre
  #validarFin() {
    if (this.#horaInicio && this.#duracion && this.finMin > CIERRE)
      throw new Error(`Ese turno terminaría a las ${this.horaFin}; el complejo cierra a las 23:00.`);
  }
}

/* =====================================================================
   CLASE GestorReservas
   Administra la colección de Turnos. Es la única que habla con localStorage.
   Cada cambio (agregar, cancelar, eliminar...) se guarda automáticamente.
   ===================================================================== */
class GestorReservas {
  #turnos = [];
  #clave;

  constructor(clave = "reservas-canchas") {
    this.#clave = clave;
    this.#cargar();
  }

  get turnos() { return [...this.#turnos]; } // devuelve una COPIA: no se puede romper el arreglo original

  /* ----- localStorage ----- */
  // localStorage solo guarda texto, por eso usamos JSON.stringify al guardar y JSON.parse al leer.
  #guardar() { localStorage.setItem(this.#clave, JSON.stringify(this.#turnos)); }

  #cargar() {
    try {
      const datos = JSON.parse(localStorage.getItem(this.#clave) ?? "[]");
      // Al leer, volvemos a crear instancias de Turno (JSON trae objetos sin métodos)
      this.#turnos = datos.map((d) => new Turno(d));
    } catch {
      this.#turnos = []; // datos corruptos: empezamos limpio en vez de romper la app
    }
  }

  #buscar(id) {
    const turno = this.#turnos.find((t) => t.id === id);
    if (!turno) throw new Error("No se encontró el turno.");
    return turno;
  }

  /* ----- Operaciones ----- */
  agregar(datos) {
    const nuevo = new Turno(datos); // si algún dato es inválido, Turno lanza el error
    const hoy = new Date().toLocaleDateString("sv"); // AAAA-MM-DD en hora local
    if (nuevo.fecha < hoy) throw new Error("No se puede reservar en una fecha pasada.");

    // Regla clave: dos turnos activos no pueden pisarse en la misma cancha
    const choque = this.#turnos.find((t) => t.activo && t.solapaCon(nuevo));
    if (choque) throw new Error(`${nuevo.cancha} ya está reservada de ${choque.horaInicio} a ${choque.horaFin} (${choque.responsable}).`);

    // La seña confirma el turno; si cubre el total queda pagado
    if (nuevo.senia > 0) nuevo.confirmar();
    if (nuevo.senia === nuevo.total) nuevo.marcarPagado();

    this.#turnos.push(nuevo);
    this.#guardar();
    return nuevo;
  }

  confirmar(id)    { this.#buscar(id).confirmar();    this.#guardar(); }
  marcarPagado(id) { this.#buscar(id).marcarPagado(); this.#guardar(); }
  cancelar(id)     { this.#buscar(id).cancelar();     this.#guardar(); }
  eliminar(id)     { this.#buscar(id); this.#turnos = this.#turnos.filter((t) => t.id !== id); this.#guardar(); }
  reiniciar()      { this.#turnos = []; localStorage.removeItem(this.#clave); }

  /** Filtra por cancha, estado y/o fecha (los vacíos no filtran) y ordena cronológicamente */
  filtrar({ cancha = "", estado = "", fecha = "" } = {}) {
    return this.#turnos
      .filter((t) => (!cancha || t.cancha === cancha) && (!estado || t.estado === estado) && (!fecha || t.fecha === fecha))
      .sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio));
  }

  /** Métricas sobre los turnos activos (los cancelados no suman) */
  estadisticas() {
    const activos = this.#turnos.filter((t) => t.activo);
    return {
      activas: activos.length,
      recaudado: activos.reduce((suma, t) => suma + t.senia, 0),
      pendiente: activos.reduce((suma, t) => suma + t.saldo, 0),
    };
  }
}

/* =====================================================================
   CLASE Interfaz
   Conecta el HTML con el GestorReservas: lee el formulario, llama al
   gestor y vuelve a dibujar la pantalla. No guarda datos propios.
   ===================================================================== */
class Interfaz {
  #gestor;
  #$ = (id) => document.getElementById(id);

  constructor(gestor) {
    this.#gestor = gestor;
    this.#prepararCampos();
    this.#eventos();
    this.#dibujar();
  }

  #prepararCampos() {
    const opciones = Object.entries(CANCHAS).map(([n, c]) => new Option(`${n} - ${c.deporte} (${pesos(c.precioHora)}/h)`, n));
    opciones.forEach((o) => this.#$("cancha").add(o));
    Object.keys(CANCHAS).forEach((n) => this.#$("f-cancha").add(new Option(n, n)));
    const hoy = new Date().toLocaleDateString("sv");
    this.#$("fecha").min = hoy;
    this.#$("fecha").value = hoy;
    this.#$("hora").value = "18:00";
    this.#actualizarTotal();
  }

  #eventos() {
    this.#$("form-turno").addEventListener("submit", (e) => { e.preventDefault(); this.#reservar(); });
    ["cancha", "duracion"].forEach((id) => this.#$(id).addEventListener("change", () => this.#actualizarTotal()));
    ["f-cancha", "f-estado", "f-fecha"].forEach((id) => this.#$(id).addEventListener("change", () => this.#dibujar()));
    this.#$("limpiar-filtros").addEventListener("click", () => {
      ["f-cancha", "f-estado", "f-fecha"].forEach((id) => (this.#$(id).value = ""));
      this.#dibujar();
    });
    this.#$("reiniciar").addEventListener("click", () => {
      if (confirm("¿Borrar TODAS las reservas? Esta acción no se puede deshacer.")) { this.#gestor.reiniciar(); this.#dibujar(); }
    });
    // Delegación de eventos: un solo "oyente" para todos los botones de la lista
    this.#$("lista-turnos").addEventListener("click", (e) => {
      const boton = e.target.closest("button[data-accion]");
      if (boton) this.#accion(boton.dataset.accion, boton.dataset.id);
    });
  }

  #actualizarTotal() {
    const total = CANCHAS[this.#$("cancha").value].precioHora * (Number(this.#$("duracion").value) / 60);
    this.#$("vista-total").textContent = `Total del turno: ${pesos(total)}`;
  }

  #mensaje(texto, ok = false) {
    const m = this.#$("mensaje");
    m.textContent = texto;
    m.classList.toggle("ok", ok);
  }

  #reservar() {
    try {
      this.#gestor.agregar({
        cancha: this.#$("cancha").value,
        responsable: this.#$("responsable").value,
        fecha: this.#$("fecha").value,
        horaInicio: this.#$("hora").value,
        duracion: this.#$("duracion").value,
        senia: this.#$("senia").value,
      });
      this.#$("responsable").value = "";
      this.#$("senia").value = 0;
      this.#mensaje("¡Reserva creada con éxito!", true);
      this.#dibujar();
    } catch (error) {
      this.#mensaje(error.message); // las validaciones de Turno/Gestor llegan hasta acá
    }
  }

  #accion(accion, id) {
    try {
      if (accion === "eliminar" && !confirm("¿Eliminar este turno definitivamente?")) return;
      this.#gestor[accion](id); // accion = "confirmar" | "marcarPagado" | "cancelar" | "eliminar"
      this.#dibujar();
    } catch (error) {
      this.#mensaje(error.message);
    }
  }

  /** Vuelve a dibujar métricas y listado desde los datos del gestor */
  #dibujar() {
    const filtrados = this.#gestor.filtrar({
      cancha: this.#$("f-cancha").value, estado: this.#$("f-estado").value, fecha: this.#$("f-fecha").value,
    });
    const s = this.#gestor.estadisticas();
    this.#$("m-activas").textContent = s.activas;
    this.#$("m-recaudado").textContent = pesos(s.recaudado);
    this.#$("m-pendiente").textContent = pesos(s.pendiente);
    this.#$("m-filtrados").textContent = filtrados.length;

    const lista = this.#$("lista-turnos");
    lista.replaceChildren(); // vacía la lista
    if (!filtrados.length) {
      const vacio = document.createElement("li");
      vacio.className = "vacio";
      vacio.textContent = "No hay turnos para mostrar.";
      lista.append(vacio);
      return;
    }
    filtrados.forEach((t) => lista.append(this.#tarjeta(t)));
  }

  #tarjeta(t) {
    const li = document.createElement("li");
    li.className = `turno ${t.estado}`;
    // textContent (y no innerHTML) evita que un nombre con código HTML rompa la página
    const titulo = document.createElement("h3");
    titulo.textContent = `${t.cancha} · ${CANCHAS[t.cancha].deporte}`;
    const etiqueta = document.createElement("span");
    etiqueta.className = "etiqueta";
    etiqueta.textContent = t.estado;
    titulo.append(etiqueta);

    const linea = (texto) => { const p = document.createElement("p"); p.textContent = texto; return p; };
    li.append(titulo,
      linea(`${t.responsable} · ${t.fecha.split("-").reverse().join("/")} · ${t.horaInicio} a ${t.horaFin}`),
      linea(`Total ${pesos(t.total)} · Seña ${pesos(t.senia)} · Saldo ${pesos(t.saldo)}`));

    const acciones = document.createElement("div");
    acciones.className = "acciones";
    const boton = (texto, accion) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn"; b.textContent = texto;
      b.dataset.accion = accion; b.dataset.id = t.id;
      b.setAttribute("aria-label", `${texto} turno de ${t.responsable}`);
      acciones.append(b);
    };
    if (t.estado === "pendiente") boton("Confirmar", "confirmar");
    if (t.activo && t.estado !== "pagado") boton("Marcar pagado", "marcarPagado");
    if (t.activo) boton("Cancelar", "cancelar");
    boton("Eliminar", "eliminar");
    li.append(acciones);
    return li;
  }
}

/* ---------- Arranque: se crea el gestor (que carga localStorage) y la interfaz ---------- */
new Interfaz(new GestorReservas());
