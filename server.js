const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'minsook_farm_jwt_secure_secret_2026';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'minsook123!';

// Custom server routes mapping
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index_new.html'));
});

// Middleware
// Product images are sent as data URLs from the admin page. Keep the request
// limit above Express's small default so several selected photos can be saved.
app.use(express.json({ limit: '100mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/admin-panel', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Database setup
let db;

if (process.env.DATABASE_URL) {
  console.log('Using Supabase (PostgreSQL) database.');
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  // SQLite compatibility layer for PostgreSQL
  db = {
    serialize(callback) {
      callback();
    },
    run(query, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      } else if (!params) {
        params = [];
      }
      const { pgQuery, pgParams } = convertSqliteToPostgres(query, params);
      pool.query(pgQuery, pgParams, function(err, result) {
        if (err) {
          if (callback) callback(err);
          return;
        }
        let lastID = null;
        if (result.rows && result.rows.length > 0) {
          lastID = result.rows[0].id;
        }
        const context = {
          lastID: lastID,
          changes: result.rowCount
        };
        if (callback) {
          callback.call(context, null);
        }
      });
    },
    get(query, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      } else if (!params) {
        params = [];
      }
      const { pgQuery, pgParams } = convertSqliteToPostgres(query, params);
      pool.query(pgQuery, pgParams, (err, result) => {
        if (err) {
          if (callback) callback(err, null);
          return;
        }
        const row = result.rows && result.rows.length > 0 ? result.rows[0] : null;
        if (callback) callback(null, row);
      });
    },
    all(query, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      } else if (!params) {
        params = [];
      }
      const { pgQuery, pgParams } = convertSqliteToPostgres(query, params);
      pool.query(pgQuery, pgParams, (err, result) => {
        if (err) {
          if (callback) callback(err, null);
          return;
        }
        if (callback) callback(null, result.rows);
      });
    }
  };

  // Helper to convert SQLite SQL dialect & placeholders to PostgreSQL
  function convertSqliteToPostgres(query, params) {
    let pgParams = Array.isArray(params) ? params : (params ? [params] : []);
    let pgQuery = query;

    pgQuery = pgQuery.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
    pgQuery = pgQuery.replace(/DATETIME/gi, 'TIMESTAMP');

    if (/insert\s+or\s+ignore\s+into\s+configs/i.test(pgQuery)) {
      pgQuery = pgQuery.replace(/insert\s+or\s+ignore\s+into\s+configs/i, 'INSERT INTO configs');
      pgQuery += ' ON CONFLICT (key) DO NOTHING';
    }
    if (/insert\s+or\s+replace\s+into\s+configs/i.test(pgQuery)) {
      pgQuery = pgQuery.replace(/insert\s+or\s+replace\s+into\s+configs/i, 'INSERT INTO configs');
      pgQuery += ' ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value';
    }

    let index = 1;
    pgQuery = pgQuery.replace(/\?/g, () => `$${index++}`);

    if (/insert\s+into\s+orders/i.test(pgQuery) && !/returning/i.test(pgQuery)) {
      pgQuery += ' RETURNING id';
    }

    return { pgQuery, pgParams };
  }

  // Initialize DB tables
  initializeDatabase();

  // Migrate local SQLite database to Supabase if exists
  migrateLocalSqliteToSupabase(pool);

} else {
  console.log('Using local SQLite database.');
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = process.env.VERCEL ? '/tmp/database.db' : path.join(__dirname, 'database.db');
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Database connection failed:', err);
    } else {
      console.log('Connected to SQLite database.');
      initializeDatabase();
    }
  });
}

function initializeDatabase() {
  db.serialize(() => {
    // Orders table
    db.run(`CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      memo TEXT,
      items TEXT NOT NULL, -- JSON string representation
      total_price INTEGER NOT NULL,
      status TEXT DEFAULT '주문', -- '주문', '결제', '택배사'
      tracking_number TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Migrate existing DB if tracking_number is missing
    db.run("ALTER TABLE orders ADD COLUMN tracking_number TEXT", (err) => {
      if (err) {
        // Column probably already exists, which is expected on subsequent runs
      } else {
        console.log("Migration: Added tracking_number column to orders table.");
      }
    });

    // Migrate existing DB if courier is missing
    db.run("ALTER TABLE orders ADD COLUMN courier TEXT", (err) => {
      if (err) {
        // Column probably already exists, which is expected on subsequent runs
      } else {
        console.log("Migration: Added courier column to orders table.");
      }
    });

    // Configs table (for storing system settings like custom admin password)
    db.run(`CREATE TABLE IF NOT EXISTS configs (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`, (err) => {
      if (err) {
        console.error('Failed to create configs table:', err);
        return;
      }

      // Initialize or update admin password in config
      db.get("SELECT value FROM configs WHERE key = 'admin_password'", (err, row) => {
        if (err) {
          console.error(err);
        } else {
          const hash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);
          if (!row) {
            db.run("INSERT INTO configs (key, value) VALUES ('admin_password', ?)", [hash], (err) => {
              if (err) console.error('Failed to set default admin password in configs:', err);
              else console.log('Default admin password initialized in configs.');
            });
          } else {
            db.run("UPDATE configs SET value = ? WHERE key = 'admin_password'", [hash], (err) => {
              if (err) console.error('Failed to update admin password in configs:', err);
              else console.log('Admin password synchronized in configs.');
            });
          }
        }
      });

      // Initialize default prices in configs if not present
      const defaultPrices = {
        price_special_kg: '7900',
        price_special_qty: '7500',
        price_good_kg: '5900',
        price_good_qty: '5500',
        price_value_kg: '3900',
        price_bite_kg: '5800'
      };

      for (const [key, val] of Object.entries(defaultPrices)) {
        db.run("INSERT OR IGNORE INTO configs (key, value) VALUES (?, ?)", [key, val], (err) => {
          if (err) console.error(`Failed to initialize default price for ${key}:`, err);
        });
      }
    });

    // Products table
    db.run(`CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      price INTEGER NOT NULL,
      unit TEXT NOT NULL,
      step REAL DEFAULT 1.0,
      badge_text TEXT,
      badge_class TEXT,
      is_bite INTEGER DEFAULT 0,
      is_qty INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) {
        console.error('Failed to create products table:', err);
        return;
      }

      // Add price_qty and step_qty columns for multi-unit feature if they don't exist
      db.run("ALTER TABLE products ADD COLUMN price_qty INTEGER", () => {
        db.run("ALTER TABLE products ADD COLUMN step_qty REAL", () => {
          db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
            if (!err && row && (row.count === 0 || row.count === '0')) {
          console.log("Initializing products table with default cucumber items...");
          db.all("SELECT key, value FROM configs WHERE key LIKE 'price_%'", (err, rows) => {
            const currentPrices = {
              price_special_kg: 7900,
              price_special_qty: 7500,
              price_good_kg: 5900,
              price_good_qty: 5500,
              price_value_kg: 3900,
              price_bite_kg: 5800
            };
            if (!err && rows) {
              rows.forEach(r => {
                if (currentPrices[r.key] !== undefined) {
                  currentPrices[r.key] = parseInt(r.value, 10);
                }
              });
            }

            const defaultProducts = [
              {
                name: '특품 오이 (무게)',
                description: '곧고 굵기가 일정하며 겉 표면의 돌기가 선명합니다. 아삭한 맛이 일품이라 생식용, 샐러드용, 그리고 고급 선물용으로 강력 추천합니다.',
                image_url: 'minsook_main.jpg',
                price: currentPrices.price_special_kg,
                unit: 'kg',
                step: 1.0,
                badge_text: '최상급 선물용',
                badge_class: 'badge-special',
                is_bite: 0,
                is_qty: 0
              },
              {
                name: '특품 오이 (개수)',
                description: '곧고 굵기가 일정하며 겉 표면의 돌기가 선명합니다. 10개 단위로 실속 있게 구매할 수 있습니다.',
                image_url: 'minsook_main.jpg',
                price: currentPrices.price_special_qty,
                unit: '개',
                step: 10.0,
                badge_text: '최상급 선물용',
                badge_class: 'badge-special',
                is_bite: 0,
                is_qty: 1
              },
              {
                name: '상품 오이 (무게)',
                description: '모양과 굵기가 준수하며 일상적인 식탁에 어울리는 등급입니다. 무침, 냉국, 피클 등 가벼운 반찬거리를 만드는 가정용으로 제격입니다.',
                image_url: 'minsook_detail_2.jpg',
                price: currentPrices.price_good_kg,
                unit: 'kg',
                step: 1.0,
                badge_text: '가정용 추천',
                badge_class: 'badge-good',
                is_bite: 0,
                is_qty: 0
              },
              {
                name: '상품 오이 (개수)',
                description: '모양과 굵기가 준수하며 일상적인 식탁에 어울리는 등급입니다. 10개 단위로 실속 있게 구매할 수 있습니다.',
                image_url: 'minsook_detail_2.jpg',
                price: currentPrices.price_good_qty,
                unit: '개',
                step: 10.0,
                badge_text: '가정용 추천',
                badge_class: 'badge-good',
                is_bite: 0,
                is_qty: 1
              },
              {
                name: '공품 오이 (못난이)',
                description: '조금 휘거나 크기가 일정하지 않은 등급이지만, 맛과 아삭함은 특품과 똑같습니다. 가격 부담이 적어 오이지, 오이소박이 등 대용량 조리 시 적합합니다.',
                image_url: 'minsook_detail_1.jpg',
                price: currentPrices.price_value_kg,
                unit: 'kg',
                step: 1.0,
                badge_text: '실속형 대용량',
                badge_class: 'badge-value',
                is_bite: 0,
                is_qty: 0
              },
              {
                name: '한입 오이',
                description: '작고 귀여운 사이즈로 등산이나 나들이 갈 때 가방에 쏙 들어갑니다. 껍질째 그대로 한 입에 아삭아삭 씹어 먹기 편리한 민숙농장의 인기 시그니처입니다.',
                image_url: 'minsook_main.jpg',
                price: currentPrices.price_bite_kg,
                unit: 'kg',
                step: 0.5,
                badge_text: '농장 시그니처',
                badge_class: 'badge-signature',
                is_bite: 1,
                is_qty: 0
              }
            ];

            function insertProduct(index) {
              if (index >= defaultProducts.length) {
                console.log("Products table initialized and backfilled from configs.");
                return;
              }
              const p = defaultProducts[index];
              db.run(
                "INSERT INTO products (name, description, image_url, price, unit, step, badge_text, badge_class, is_bite, is_qty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [p.name, p.description, p.image_url, p.price, p.unit, p.step, p.badge_text, p.badge_class, p.is_bite, p.is_qty],
                (err) => {
                  if (err) {
                    console.error("Failed to insert product:", p.name, err);
                  }
                  insertProduct(index + 1);
                }
              );
            }
            insertProduct(0);
          });
        }
      });
        });
      });
    });
  });
}

// Authentication Middleware
function authenticateAdmin(req, res, next) {
  const token = req.cookies.admin_token;
  if (!token) {
    return res.status(401).json({ error: 'Access denied. Please log in.' });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.admin = verified;
    next();
  } catch (err) {
    res.status(400).json({ error: 'Invalid token.' });
  }
}

// Multer storage configuration for product images
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname)); // Store in the root directory for immediate static serving
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'product-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: function (req, file, cb) {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('이미지 파일만 업로드할 수 있습니다.'));
    }
    cb(null, true);
  }
});

// --- API Endpoints ---

// 0. File Upload Endpoint (Protected)
app.post('/api/admin/upload', authenticateAdmin, (req, res) => {
  upload.single('image')(req, res, function (err) {
    if (err) {
      console.error('File upload failed:', err);
      return res.status(400).json({ error: err.message || '파일 업로드에 실패했습니다.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: '업로드할 파일이 없습니다.' });
    }
    res.json({ success: true, filename: req.file.filename });
  });
});

// 1. Submit Order (Public)
app.post('/api/orders', (req, res) => {
  const { name, phone, address, memo, items, totalPrice } = req.body;

  if (!name || !phone || !address || !items) {
    return res.status(400).json({ error: 'Missing required order fields.' });
  }

  const itemsJson = JSON.stringify(items);

  db.run(
    `INSERT INTO orders (name, phone, address, memo, items, total_price) VALUES (?, ?, ?, ?, ?, ?)`,
    [name, phone, address, memo, itemsJson, totalPrice],
    function (err) {
      if (err) {
        console.error('Order insertion failed:', err);
        return res.status(500).json({ error: 'Database insertion error.' });
      }

      const orderId = this.lastID;
      const itemsListStr = Array.isArray(items) ? items.map(i => `${i.name} ${i.quantity}${i.unit}`).join(', ') : '선택 상품 없음';
      const itemsText = Array.isArray(items) ? items.map(i => ` - ${i.name}: ${i.quantity}${i.unit}\n`).join('') : ' - 선택 상품 없음\n';

      const customerTemplate = `[민숙농장 직거래 주문 신청]
■ 주문자명: ${name}
■ 연락처: ${phone}
■ 주문 상품 내역:
${itemsText}■ 배송지 주소: ${address}
■ 총 입금 예정 금액: ${totalPrice.toLocaleString()}원
■ 입금 계좌: 농협 312-0219-8388-41 최정민(민숙농장)
■ 배송 메모: ${memo || '선택 없음'}

※ 민숙농장 카카오톡 채널로 본 주문서를 붙여넣어 전송해 주시면 입금 확인 즉시 주문 상품을 배송해 드립니다.`;

      // --- [SIMULATION] KakaoTalk Notification to Customer ---
      console.log(`\n==================================================`);
      console.log(`[카카오톡 알림톡 전송 완료 - 발송 채널: 민숙농장]`);
      console.log(`수신인 (고객): ${name} (${phone})`);
      console.log(`--------------------------------------------------`);
      console.log(customerTemplate);
      console.log(`==================================================\n`);

      // --- [SIMULATION] KakaoTalk Notification to Seller ---
      console.log(`==================================================`);
      console.log(`[카카오톡 알림톡 전송 완료 - 발송 채널: 시스템 알림]`);
      console.log(`수신인 (판매자): 민숙농장 (010-8990-4046)`);
      console.log(`--------------------------------------------------`);
      console.log(`[민숙농장] 신규 주문 발생 안내`);
      console.log(`새로운 직거래 주문이 접수되었습니다! 입금 정보를 확인해 주세요.\n`);
      console.log(`■ 주문번호: #${orderId}`);
      console.log(`■ 주문자명: ${name} (${phone})`);
      console.log(`■ 주문내역: ${itemsListStr}`);
      console.log(`■ 결제금액: ${totalPrice.toLocaleString()}원`);
      console.log(`■ 배송지 주소: ${address}`);
      console.log(`■ 배송요청사항: ${memo || '선택 없음'}`);
      console.log(`==================================================\n`);

      res.status(201).json({ success: true, orderId: orderId });
    }
  );
});

// 1-1. Query Order History by Phone Number (Public)
app.post('/api/orders/query', (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: '전화번호를 입력해 주세요.' });
  }

  // 검색어 정제: 숫자만 남김
  const cleanPhone = phone.replace(/[^0-9]/g, '');

  if (cleanPhone.length < 9) {
    return res.status(400).json({ error: '올바른 전화번호 형식이 아닙니다.' });
  }

  // SQLite와 PostgreSQL 모두에서 호환되는 replace 쿼리 사용
  const query = `
    SELECT id, name, phone, address, memo, items, total_price, status, tracking_number, courier, created_at
    FROM orders
    WHERE replace(phone, '-', '') = ? OR phone = ?
    ORDER BY created_at DESC
  `;

  db.all(query, [cleanPhone, phone], (err, rows) => {
    if (err) {
      console.error('Order query failed:', err);
      return res.status(500).json({ error: '주문 내역 조회 중 오류가 발생했습니다.' });
    }

    if (!rows || rows.length === 0) {
      return res.json({ success: true, orders: [] });
    }

    // 개인정보 보호 마스킹 및 아이템 JSON 파싱
    const maskedOrders = rows.map(row => {
      // 1. 이름 마스킹 (예: 홍길동 -> 홍*동, 김철 -> 김*, 제갈민수 -> 제**수)
      let maskedName = row.name;
      if (row.name && row.name.length > 1) {
        if (row.name.length === 2) {
          maskedName = row.name[0] + '*';
        } else {
          const middleMask = '*'.repeat(row.name.length - 2);
          maskedName = row.name[0] + middleMask + row.name[row.name.length - 1];
        }
      }

      // 2. 전화번호 마스킹 (예: 010-1234-5678 -> 010-****-5678)
      let maskedPhone = row.phone;
      const parts = row.phone.split('-');
      if (parts.length === 3) {
        maskedPhone = `${parts[0]}-****-${parts[2]}`;
      } else if (row.phone.length >= 10) {
        // 하이픈이 없는 경우
        maskedPhone = row.phone.substring(0, 3) + '****' + row.phone.substring(row.phone.length - 4);
      } else {
        maskedPhone = '***-****-****';
      }

      // 3. 주소 마스킹 (앞 3단어만 남김. 예: 전남 고흥군 고흥읍 백련장전길... -> 전남 고흥군 고흥읍 ***)
      let maskedAddress = row.address;
      if (row.address) {
        const addrParts = row.address.trim().split(/\s+/);
        if (addrParts.length > 3) {
          maskedAddress = addrParts.slice(0, 3).join(' ') + ' ***';
        } else {
          maskedAddress = addrParts.join(' ') + ' ***';
        }
      }

      // 4. 아이템 JSON 파싱
      let parsedItems = [];
      try {
        parsedItems = JSON.parse(row.items);
      } catch (e) {
        console.error('Failed to parse order items json:', e);
      }

      return {
        id: row.id,
        name: maskedName,
        phone: maskedPhone,
        address: maskedAddress,
        memo: row.memo ? '***' : '', // 메모도 개인정보가 있을 수 있으므로 마스킹
        items: parsedItems,
        totalPrice: row.total_price,
        status: row.status,
        trackingNumber: row.tracking_number,
        courier: row.courier,
        createdAt: row.created_at
      };
    });

    res.json({ success: true, orders: maskedOrders });
  });
});

// 2. Admin Login (Common admin login password only)
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password is required.' });
  }

  db.get("SELECT value FROM configs WHERE key = 'admin_password'", (err, config) => {
    if (err || !config) {
      return res.status(500).json({ error: 'System configuration error.' });
    }

    const isValid = bcrypt.compareSync(password, config.value);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid password.' });
    }

    // Generate token
    const token = jwt.sign({ role: 'admin', username: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
    res.cookie('admin_token', token, { httpOnly: true, maxAge: 12 * 60 * 60 * 1000 });
    return res.json({ success: true, role: 'admin' });
  });
});

// 3. Admin Logout
app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ success: true });
});

// 4. Fetch All Orders (Protected)
app.get('/api/admin/orders', authenticateAdmin, (req, res) => {
  db.all("SELECT * FROM orders ORDER BY created_at DESC", (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to retrieve orders.' });
    }
    // Parse items JSON strings back to objects
    const orders = rows.map(row => ({
      ...row,
      items: JSON.parse(row.items)
    }));
    res.json({ orders });
  });
});

// 5. Update Order Status (Protected)
app.put('/api/admin/orders/:id/status', authenticateAdmin, (req, res) => {
  const { id } = req.params;
  const { status, trackingNumber, courier } = req.body; // '주문', '결제', '택배사', '주문취소'

  if (!['주문', '결제', '택배사', '주문취소'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status value.' });
  }

  const tracking = (status === '택배사') ? (trackingNumber || null) : null;
  const cr = (status === '택배사') ? (courier || null) : null;

  db.run("UPDATE orders SET status = ?, tracking_number = ?, courier = ? WHERE id = ?", [status, tracking, cr, id], function (err) {
    if (err) {
      console.error('Failed to update status:', err);
      return res.status(500).json({ error: 'Failed to update order status.' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    // --- [SIMULATION] KakaoTalk Delivery Notification ---
    if (status === '택배사' && tracking) {
      db.get("SELECT name, phone, courier FROM orders WHERE id = ?", [id], (err, order) => {
        if (!err && order) {
          console.log(`\n==================================================`);
          console.log(`[카카오톡 알림톡 전송 완료 - 발송 채널: 민숙농장]`);
          console.log(`수신인 (고객): ${order.name} (${order.phone})`);
          console.log(`--------------------------------------------------`);
          console.log(`[민숙농장] 배송 시작 및 송장 번호 안내`);
          console.log(`안녕하세요, ${order.name} 고객님!`);
          console.log(`주문하신 상품이 택배사에 전달되어 배송이 시작되었습니다.\n`);
          console.log(`■ 주문번호: #${id}`);
          console.log(`■ 택배사: ${order.courier || '우체국택배'}`);
          console.log(`■ 송장번호: ${tracking}`);
          console.log(`--------------------------------------------------`);
          console.log(`배송 조회를 통해 실시간 위치를 확인해 보실 수 있습니다.`);
          console.log(`민숙농장과 함께 건강하고 행복한 하루 보내세요!`);
          console.log(`==================================================\n`);
        }
      });
    }

    res.json({ success: true });
  });
});

// 5-1. Batch Delete Orders (Protected)
app.post('/api/admin/orders/delete', authenticateAdmin, (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Invalid or empty IDs array.' });
  }

  const placeholders = ids.map(() => '?').join(',');
  const query = `DELETE FROM orders WHERE id IN (${placeholders})`;

  db.run(query, ids, function (err) {
    if (err) {
      console.error('Batch delete failed:', err);
      return res.status(500).json({ error: 'Failed to delete orders.' });
    }
    res.json({ success: true, deletedCount: this.changes });
  });
});

// 6. Get Cucumber Prices (Public)
app.get('/api/prices', (req, res) => {
  db.all("SELECT key, value FROM configs WHERE key LIKE 'price_%'", (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to retrieve prices.' });
    }
    const prices = {};
    rows.forEach(row => {
      prices[row.key] = parseInt(row.value, 10);
    });
    res.json({ prices });
  });
});

// 7. Update Cucumber Prices (Protected)
app.put('/api/admin/prices', authenticateAdmin, (req, res) => {
  const { prices } = req.body;
  if (!prices || typeof prices !== 'object') {
    return res.status(400).json({ error: 'Invalid prices payload.' });
  }

  db.serialize(() => {
    let transactionSuccess = true;
    db.run("BEGIN TRANSACTION");

    for (const [key, val] of Object.entries(prices)) {
      if (!key.startsWith('price_')) continue;
      const numVal = parseInt(val, 10);
      if (isNaN(numVal) || numVal < 0) {
        transactionSuccess = false;
        break;
      }

      db.run("INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)", [key, String(numVal)], (err) => {
        if (err) {
          console.error(`Failed to update price for ${key}:`, err);
          transactionSuccess = false;
        }
      });
    }

    if (transactionSuccess) {
      db.run("COMMIT", (err) => {
        if (err) {
          return res.status(500).json({ error: 'Commit failed.' });
        }
        res.json({ success: true, message: 'Prices updated successfully.' });
      });
    } else {
      db.run("ROLLBACK", () => {
        res.status(400).json({ error: 'Failed to update some prices. Transaction rolled back.' });
      });
    }
  });
});

// --- Products API ---

// 1. Fetch All Products (Public)
app.get('/api/products', (req, res) => {
  db.all("SELECT * FROM products ORDER BY id ASC", (err, rows) => {
    if (err) {
      console.error('Failed to retrieve products:', err);
      return res.status(500).json({ error: 'Failed to retrieve products.' });
    }
    res.json({ products: rows });
  });
});

// 2. Add New Product (Protected)
app.post('/api/admin/products', authenticateAdmin, (req, res) => {
  const { name, description, image_url, price, unit, step, badge_text, badge_class, is_bite, is_qty, price_qty, step_qty } = req.body;

  if (!name || price === undefined || !unit) {
    return res.status(400).json({ error: 'Missing required product fields.' });
  }

  const numPrice = parseInt(price, 10);
  const numStep = parseFloat(step) || 1.0;
  const bitVal = is_bite ? 1 : 0;
  const qtyVal = is_qty ? 1 : 0;
  const numPriceQty = (price_qty !== undefined && price_qty !== null && price_qty !== '') ? parseInt(price_qty, 10) : null;
  const numStepQty = (step_qty !== undefined && step_qty !== null && step_qty !== '') ? parseFloat(step_qty) : null;

  db.run(
    `INSERT INTO products (name, description, image_url, price, unit, step, badge_text, badge_class, is_bite, is_qty, price_qty, step_qty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, description || '', image_url || '', numPrice, unit, numStep, badge_text || '', badge_class || '', bitVal, qtyVal, numPriceQty, numStepQty],
    function (err) {
      if (err) {
        console.error('Product insertion failed:', err);
        return res.status(500).json({ error: 'Failed to add product.' });
      }
      res.status(201).json({ success: true, productId: this.lastID });
    }
  );
});

// 3. Update Product (Protected)
app.put('/api/admin/products/:id', authenticateAdmin, (req, res) => {
  const { id } = req.params;
  const { name, description, image_url, price, unit, step, badge_text, badge_class, is_bite, is_qty, price_qty, step_qty } = req.body;

  if (!name || price === undefined || !unit) {
    return res.status(400).json({ error: 'Missing required product fields.' });
  }

  const numPrice = parseInt(price, 10);
  const numStep = parseFloat(step) || 1.0;
  const bitVal = is_bite ? 1 : 0;
  const qtyVal = is_qty ? 1 : 0;
  const numPriceQty = (price_qty !== undefined && price_qty !== null && price_qty !== '') ? parseInt(price_qty, 10) : null;
  const numStepQty = (step_qty !== undefined && step_qty !== null && step_qty !== '') ? parseFloat(step_qty) : null;

  db.run(
    `UPDATE products SET name = ?, description = ?, image_url = ?, price = ?, unit = ?, step = ?, badge_text = ?, badge_class = ?, is_bite = ?, is_qty = ?, price_qty = ?, step_qty = ? WHERE id = ?`,
    [name, description || '', image_url || '', numPrice, unit, numStep, badge_text || '', badge_class || '', bitVal, qtyVal, numPriceQty, numStepQty, id],
    function (err) {
      if (err) {
        console.error('Product update failed:', err);
        return res.status(500).json({ error: 'Failed to update product.' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Product not found.' });
      }
      res.json({ success: true });
    }
  );
});

// 4. Delete Product (Protected)
app.delete('/api/admin/products/:id', authenticateAdmin, (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM products WHERE id = ?", [id], function (err) {
    if (err) {
      console.error('Product deletion failed:', err);
      return res.status(500).json({ error: 'Failed to delete product.' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    res.json({ success: true });
  });
});

// 8. Change Password (Protected)
app.put('/api/admin/change-password', authenticateAdmin, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword) {
    return res.status(400).json({ error: 'New password is required.' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);

  db.run("UPDATE configs SET value = ? WHERE key = 'admin_password'", [hash], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to update admin password.' });
    }
    res.json({ success: true, message: 'Admin password updated successfully.' });
  });
});

// --- Local Data Migration Helpers and APIs ---

function readAllFromLocalDb(localDb, query) {
  return new Promise((resolve, reject) => {
    localDb.all(query, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function migrateLocalSqliteToSupabase(pool) {
  const dbPath = path.join(__dirname, 'database.db');
  if (!fs.existsSync(dbPath)) {
    return;
  }
  
  console.log("Migration: Local SQLite database found. Starting migration to Supabase...");
  const sqlite3 = require('sqlite3').verbose();
  const localDb = new sqlite3.Database(dbPath);

  try {
    // 1. configs Migration
    const configs = await readAllFromLocalDb(localDb, "SELECT key, value FROM configs");
    console.log(`Migration: Found ${configs.length} configurations in SQLite.`);
    for (const config of configs) {
      await pool.query(
        "INSERT INTO configs (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        [config.key, config.value]
      );
    }
    console.log("Migration: Configs table migrated.");

    // 1-2. products Migration
    const products = await readAllFromLocalDb(localDb, "SELECT * FROM products");
    console.log(`Migration: Found ${products.length} products in SQLite.`);
    let migratedProductsCount = 0;
    let skippedProductsCount = 0;

    for (const prod of products) {
      const checkRes = await pool.query(
        "SELECT id FROM products WHERE name = $1 AND unit = $2",
        [prod.name, prod.unit]
      );

      if (checkRes.rows.length === 0) {
        await pool.query(
          `INSERT INTO products (name, description, image_url, price, unit, step, badge_text, badge_class, is_bite, is_qty, created_at, price_qty, step_qty)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            prod.name,
            prod.description,
            prod.image_url,
            prod.price,
            prod.unit,
            prod.step,
            prod.badge_text,
            prod.badge_class,
            prod.is_bite,
            prod.is_qty,
            prod.created_at ? new Date(prod.created_at) : new Date(),
            prod.price_qty !== undefined ? prod.price_qty : null,
            prod.step_qty !== undefined ? prod.step_qty : null
          ]
        );
        migratedProductsCount++;
      } else {
        skippedProductsCount++;
      }
    }
    console.log(`Migration: Products table migration completed. Migrated: ${migratedProductsCount}, Skipped: ${skippedProductsCount}`);

    // 2. orders Migration
    const orders = await readAllFromLocalDb(localDb, "SELECT * FROM orders");
    console.log(`Migration: Found ${orders.length} orders in SQLite.`);
    let migratedCount = 0;
    let skippedCount = 0;

    for (const order of orders) {
      // Check for duplicate in Supabase
      const checkRes = await pool.query(
        "SELECT id FROM orders WHERE name = $1 AND phone = $2 AND total_price = $3",
        [order.name, order.phone, order.total_price]
      );

      if (checkRes.rows.length === 0) {
        await pool.query(
          `INSERT INTO orders (name, phone, address, memo, items, total_price, status, tracking_number, courier, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            order.name,
            order.phone,
            order.address,
            order.memo,
            order.items,
            order.total_price,
            order.status,
            order.tracking_number,
            order.courier,
            order.created_at ? new Date(order.created_at) : new Date()
          ]
        );
        migratedCount++;
      } else {
        skippedCount++;
      }
    }
    console.log(`Migration: Orders table migration completed. Migrated: ${migratedCount}, Skipped: ${skippedCount}`);

    // Close SQLite connection
    await new Promise((resolve, reject) => {
      localDb.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Rename database file safely to mark as migrated
    const migratedPath = dbPath + '.migrated';
    fs.renameSync(dbPath, migratedPath);
    console.log(`Migration: Successfully renamed database.db to database.db.migrated`);

  } catch (err) {
    console.error("Migration: Error during SQLite to Supabase migration:", err);
    try {
      localDb.close();
    } catch (e) {}
  }
}

// LocalStorage data migration endpoint (Protected)
app.post('/api/admin/migrate-local-data', authenticateAdmin, async (req, res) => {
  const { orders, prices } = req.body;
  
  console.log("Migration API: Received local storage migration request.");

  try {
    let migratedOrdersCount = 0;
    let skippedOrdersCount = 0;

    // 1. Orders Migration
    if (orders && Array.isArray(orders)) {
      for (const order of orders) {
        const itemsJson = typeof order.items === 'string' ? order.items : JSON.stringify(order.items);
        const totalPrice = order.totalPrice || order.total_price || 0;
        const memo = order.memo || null;
        const trackingNumber = order.trackingNumber || order.tracking_number || null;
        const courier = order.courier || null;
        const status = order.status || '주문';
        const createdAt = order.createdAt || order.created_at || new Date().toISOString();

        // Check if duplicate exists
        const checkRes = await new Promise((resolve) => {
          db.all(
            "SELECT id FROM orders WHERE name = ? AND phone = ? AND total_price = ?",
            [order.name, order.phone, totalPrice],
            (err, rows) => {
              if (err) {
                console.error("Migration API: Check query error:", err);
                resolve([]);
              } else {
                resolve(rows || []);
              }
            }
          );
        });

        if (checkRes.length === 0) {
          await new Promise((resolve, reject) => {
            db.run(
              `INSERT INTO orders (name, phone, address, memo, items, total_price, status, tracking_number, courier, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [order.name, order.phone, order.address, memo, itemsJson, totalPrice, status, trackingNumber, courier, createdAt],
              function(err) {
                if (err) reject(err);
                else resolve();
              }
            );
          });
          migratedOrdersCount++;
        } else {
          skippedOrdersCount++;
        }
      }
    }

    // 2. Prices Migration
    if (prices && typeof prices === 'object') {
      for (const [key, val] of Object.entries(prices)) {
        if (!key.startsWith('price_')) continue;
        const numVal = parseInt(val, 10);
        if (isNaN(numVal) || numVal < 0) continue;

        await new Promise((resolve, reject) => {
          db.run(
            "INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)",
            [key, String(numVal)],
            function(err) {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }
    }

    res.json({
      success: true,
      message: "LocalStorage migration successful.",
      migratedOrders: migratedOrdersCount,
      skippedOrders: skippedOrdersCount
    });

  } catch (err) {
    console.error("Migration API: Error during local data migration:", err);
    res.status(500).json({ error: "Failed to migrate local storage data." });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Minsook Farm server running at http://localhost:${PORT}`);
});
