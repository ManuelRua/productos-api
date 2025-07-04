require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
// CAMBIO: Render asigna el puerto automáticamente
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Variables globales
let db;
// CAMBIO: Usar ruta absoluta para la BD
const dbPath = path.join(__dirname, 'productos.db');

// Inicializar base de datos
function initDB() {
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error abriendo BD:', err.message);
    } else {
      console.log('BD conectada');
      createTables();
    }
  });
}

// Crear tablas
function createTables() {
  // Tabla productos
  const sqlProductos = `
    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      modelo TEXT NOT NULL UNIQUE,
      precio INTEGER NOT NULL
    )
  `;
  
  // Tabla pago
  const sqlPago = `
    CREATE TABLE IF NOT EXISTS pago (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      img BLOB NOT NULL,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  db.run(sqlProductos, (err) => {
    if (err) {
      console.error('Error creando tabla productos:', err.message);
    } else {
      console.log('Tabla productos creada');
    }
  });
  
  db.run(sqlPago, (err) => {
    if (err) {
      console.error('Error creando tabla pago:', err.message);
    } else {
      console.log('Tabla pago creada');
      loadData();
    }
  });
}

// Cargar datos - ARREGLADO para evitar duplicados
function loadData() {
  // Cargar datos de productos
  db.get('SELECT COUNT(*) as count FROM productos', (err, row) => {
    if (err) {
      console.error('Error verificando datos productos:', err.message);
      return;
    }
    
    if (row.count > 0) {
      console.log(`BD ya tiene ${row.count} productos`);
    } else {
      // CAMBIO: Verificar si el archivo existe antes de leerlo
      const dataPath = path.join(__dirname, 'data', 'resumen_productos.json');
      
      if (!fs.existsSync(dataPath)) {
        console.log('Archivo de datos no encontrado, creando datos de ejemplo...');
        createSampleData();
      } else {
        try {
          const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
          
          // Usar INSERT OR IGNORE para evitar duplicados
          const stmt = db.prepare('INSERT OR IGNORE INTO productos (modelo, precio) VALUES (?, ?)');
          
          data.forEach(producto => {
            stmt.run(producto.modelo, producto.precio, (err) => {
              if (err) {
                console.error(`Error insertando ${producto.modelo}:`, err.message);
              } else {
                console.log(`Insertado: ${producto.modelo}`);
              }
            });
          });
          
          stmt.finalize((err) => {
            if (err) {
              console.error('Error finalizando statement:', err.message);
            } else {
              console.log('Datos cargados correctamente');
            }
          });
          
        } catch (error) {
          console.error('Error cargando datos:', error.message);
          createSampleData();
        }
      }
    }
  });
  
  // Cargar imagen QR de pago
  loadPaymentQR();
}

// NUEVO: Función para cargar la imagen QR de pago
function loadPaymentQR() {
  db.get('SELECT COUNT(*) as count FROM pago WHERE nombre = ?', ['pagoQR'], (err, row) => {
    if (err) {
      console.error('Error verificando imagen QR:', err.message);
      return;
    }
    
    if (row.count > 0) {
      console.log('Imagen QR ya existe en BD');
      return;
    }
    
    const imagePath = path.join(__dirname, 'data', 'pagoQR.jpeg');
    
    if (!fs.existsSync(imagePath)) {
      console.log('Imagen pagoQR.jpeg no encontrada en carpeta data');
      return;
    }
    
    try {
      const imageBuffer = fs.readFileSync(imagePath);
      
      db.run('INSERT INTO pago (nombre, img) VALUES (?, ?)', ['pagoQR', imageBuffer], function(err) {
        if (err) {
          console.error('Error insertando imagen QR:', err.message);
        } else {
          console.log('Imagen QR cargada correctamente con ID:', this.lastID);
        }
      });
      
    } catch (error) {
      console.error('Error leyendo imagen QR:', error.message);
    }
  });
}

// NUEVO: Función para crear datos de ejemplo si no existe el archivo
function createSampleData() {
  const sampleProducts = [
    { modelo: "iPhone 14", precio: 1200000 },
    { modelo: "Samsung Galaxy S23", precio: 1100000 },
    { modelo: "MacBook Air M2", precio: 1800000 },
    { modelo: "Dell XPS 13", precio: 1500000 },
    { modelo: "iPad Pro", precio: 1000000 }
  ];
  
  const stmt = db.prepare('INSERT OR IGNORE INTO productos (modelo, precio) VALUES (?, ?)');
  
  sampleProducts.forEach(producto => {
    stmt.run(producto.modelo, producto.precio, (err) => {
      if (err) {
        console.error(`Error insertando ${producto.modelo}:`, err.message);
      } else {
        console.log(`Insertado: ${producto.modelo}`);
      }
    });
  });
  
  stmt.finalize((err) => {
    if (err) {
      console.error('Error finalizando statement:', err.message);
    } else {
      console.log('Datos de ejemplo creados correctamente');
    }
  });
}

// RUTAS SIMPLES

// Ruta principal
app.get('/', (req, res) => {
  res.json({
    message: 'API Productos funcionando en Render',
    version: '1.0.0',
    status: 'OK',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /productos - Todos los productos',
      'GET /productos/search/MODELO - Buscar por modelo',
      'GET /productos/precio/MIN/MAX - Filtrar por precio',
      'GET /productos/ID - Producto por ID',
      'GET /pagoQR - Imagen QR de pago'
    ]
  });
});

// NUEVA: Ruta de health check para Render
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// NUEVO: Endpoint para obtener imagen QR de pago
app.get('/pagoQR', (req, res) => {
  db.get('SELECT img FROM pago WHERE nombre = ?', ['pagoQR'], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (!row) {
      res.status(404).json({ error: 'Imagen QR no encontrada' });
    } else {
      // Establecer headers para imagen
      res.set({
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400' // Cache por 24 horas
      });
      
      // Enviar la imagen
      res.send(row.img);
    }
  });
});

// Todos los productos
app.get('/productos', (req, res) => {
  db.all('SELECT * FROM productos ORDER BY modelo', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ success: true, count: rows.length, data: rows });
    }
  });
});

// Buscar por modelo
app.get('/productos/search/:modelo', (req, res) => {
  const modelo = req.params.modelo;
  db.all('SELECT * FROM productos WHERE modelo LIKE ?', [`%${modelo}%`], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ success: true, search: modelo, count: rows.length, data: rows });
    }
  });
});

// Filtrar por precio
app.get('/productos/precio/:min/:max', (req, res) => {
  const { min, max } = req.params;
  db.all('SELECT * FROM productos WHERE precio BETWEEN ? AND ?', [min, max], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ success: true, priceRange: { min: parseInt(min), max: parseInt(max) }, count: rows.length, data: rows });
    }
  });
});

// Producto por ID
app.get('/productos/:id', (req, res) => {
  const id = req.params.id;
  
  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID debe ser un número' });
  }
  
  db.get('SELECT * FROM productos WHERE id = ?', [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (!row) {
      res.status(404).json({ error: 'Producto no encontrado' });
    } else {
      res.json({ success: true, data: row });
    }
  });
});

// Manejo de errores 404
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint no encontrado',
    message: `La ruta ${req.originalUrl} no existe`
  });
});

// Inicializar y arrancar servidor
initDB();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📖 Documentación en /`);
  console.log(`🔍 Health check en /health`);
  console.log(`💳 Imagen QR en /pagoQR`);
});

// Cerrar BD al salir
process.on('SIGINT', () => {
  console.log('\n🔴 Cerrando servidor...');
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('Error cerrando BD:', err.message);
      } else {
        console.log('BD cerrada correctamente');
      }
    });
  }
  process.exit(0);
});

// NUEVO: Manejo de SIGTERM para Render
process.on('SIGTERM', () => {
  console.log('\n🔴 Recibido SIGTERM, cerrando servidor...');
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('Error cerrando BD:', err.message);
      } else {
        console.log('BD cerrada correctamente');
      }
    });
  }
  process.exit(0);
});