/* Catálogo de métricas predefinidas (PROPUESTA INICIAL, por validar con el relator).
 * Por defecto toda métrica del catálogo es un checklist (Cumple / No cumple, vale 1 o 0). Para una escala numérica, ponle tipo: 'escala' a la métrica.
 * Para ampliarlo: agrega grupos o métricas a esta lista. No hace falta tocar ningún otro archivo.
 * Cada métrica se COPIA a la configuración del curso al agregarla; cambiar este catálogo no altera cursos ya guardados.
 * La escala y el mínimo de aprobación son valores de partida y se pueden cambiar por métrica en la pantalla. */
(function (root) {
  'use strict';
  root.ZE = root.ZE || {};
  root.ZE.catalogo = {
    tipo: 'checklist',
    escala: { min: 0, max: 100, minAprob: 60 },
    grupos: [
      {
        nombre: 'Reentrenamiento PRT',
        metricas: [
          { tipo: 'checklist', nombre: 'Verbalización', descripcion: 'Da las instrucciones verbales de forma clara, firme y con el tono adecuado' },
          { tipo: 'checklist', nombre: 'Aproximación (Proxemia)', descripcion: 'Se aproxima manteniendo la distancia y el ángulo seguros' },
          { tipo: 'checklist', nombre: 'Posición del operador', descripcion: 'Adopta y mantiene una posición segura durante la técnica' },
          { tipo: 'checklist', nombre: 'Control Individuo', descripcion: 'Logra y mantiene el control de la persona' },
          { tipo: 'checklist', nombre: 'Esposamiento', descripcion: 'Coloca las esposas correctamente' },
          { tipo: 'checklist', nombre: 'Seguro de Esposas', descripcion: 'Activa el seguro de las esposas' },
          { tipo: 'checklist', nombre: 'Procedimiento Traslado', descripcion: 'Realiza el traslado siguiendo el procedimiento' },
          { tipo: 'checklist', nombre: 'Retiro de Esposas', descripcion: 'Retira las esposas de forma segura y controlada' },
          { tipo: 'checklist', nombre: 'Control del Entorno', descripcion: 'Mantiene la atención y el control del entorno durante todo el procedimiento' }
        ]
      },
      {
        nombre: 'Esposamiento',
        metricas: [
          { nombre: 'Aproximación y posición segura', descripcion: 'Distancia, ángulo y postura antes de iniciar la técnica' },
          { nombre: 'Control previo del sujeto', descripcion: 'Controla brazos y manos antes de esposar; da instrucciones claras' },
          { nombre: 'Colocación de las esposas', descripcion: 'Posición de las manos, orientación y colocación correcta de las esposas' },
          { nombre: 'Ajuste y comprobación', descripcion: 'Ajuste adecuado, seguro puesto y revisión de que no quede apretado de más' },
          { nombre: 'Seguridad durante el procedimiento', descripcion: 'Mantiene el control, no se expone y está atento al entorno' },
          { nombre: 'Fluidez de la ejecución', descripcion: 'Secuencia sin pausas ni movimientos innecesarios, en un tiempo razonable' },
          { nombre: 'Trato al detenido', descripcion: 'Informa lo que hace, mantiene un tono calmado y respeta a la persona' }
        ]
      },
      {
        nombre: 'Retención y control',
        metricas: [
          { nombre: 'Postura base y distancia', descripcion: 'Posición estable y distancia de seguridad antes del contacto' },
          { nombre: 'Ejecución de la técnica de control', descripcion: 'Aplica correctamente la técnica enseñada ese día' },
          { nombre: 'Fuerza gradual y proporcional', descripcion: 'El nivel de fuerza corresponde a la resistencia y no excede lo necesario' },
          { nombre: 'Zonas de contacto seguras', descripcion: 'Evita las zonas de riesgo (cabeza, cuello, columna y pecho)' },
          { nombre: 'Mantención del control', descripcion: 'Sostiene el control el tiempo necesario sin perder postura ni exponerse' },
          { nombre: 'Transición a la fase siguiente', descripcion: 'Pasa de la retención al esposamiento o a la liberación de forma ordenada' },
          { nombre: 'Monitoreo posterior', descripcion: 'Verifica respiración y estado de la persona y la deja en posición segura' }
        ]
      },
      {
        nombre: 'Comunicación y desescalamiento',
        metricas: [
          { nombre: 'Comunicación verbal', descripcion: 'Tono, claridad y órdenes simples' },
          { nombre: 'Lectura de la situación', descripcion: 'Identifica a la persona, el entorno y posibles armas antes de actuar' },
          { nombre: 'Presencia y autocontrol', descripcion: 'Postura profesional y calma bajo presión' },
          { nombre: 'Oportunidad de la decisión', descripcion: 'Desescala a tiempo o pasa a contención cuando corresponde' }
        ]
      },
      {
        nombre: 'Seguridad y procedimiento',
        metricas: [
          { nombre: 'Seguridad propia y del equipo', descripcion: 'Se protege a sí mismo y a su compañero durante la intervención' },
          { nombre: 'Cumplimiento de la secuencia', descripcion: 'Sigue el orden del procedimiento enseñado' },
          { nombre: 'Coordinación con el equipo', descripcion: 'Se comunica y reparte tareas con su compañero' },
          { nombre: 'Registro posterior', descripcion: 'Describe lo ocurrido de forma ordenada y completa' }
        ]
      },
      {
        nombre: 'Generales',
        metricas: [
          { nombre: 'Velocidad', descripcion: 'Rapidez de ejecución de la técnica' },
          { nombre: 'Eficacia', descripcion: 'La técnica logra el resultado buscado' },
          { nombre: 'Seguridad', descripcion: 'Se ejecuta sin riesgo para las personas' },
          { nombre: 'Actitud', descripcion: 'Disposición, respeto y compromiso durante la práctica' },
          { nombre: 'Participación', descripcion: 'Interviene, practica y colabora en la clase' }
        ]
      }
    ]
  };
})(typeof self !== 'undefined' ? self : this);
