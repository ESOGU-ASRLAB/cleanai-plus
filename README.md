# CleanAI+

**CleanAI+**, PyTorch modellerinizi analiz etmek, optimize etmek ve raporlamak için geliştirilmiş bir yapay zeka model yönetim platformudur. FARM Stack (FastAPI + React + MongoDB) mimarisi üzerine inşa edilmiştir.

## ✨ Özellikler

- **Model Çalıştırma & Değerlendirme** — Dataset üzerinde inference çalıştır, confusion matrix, precision/recall/F1, per-class accuracy gibi metrikleri hesapla
- **Budama & Optimizasyon** — 10'dan fazla pruning stratejisi ile model boyutunu küçült, ağırlıkları sıkıştır
- **Veri Seti Yönetimi** — CIFAR-10, ImageNet, özel pickle ve klasör formatlarını destekler
- **Önişleme Pipeline'ları** — Görsel sürükle-bırak builder veya Python kod editörü ile dönüşüm pipeline'ı oluştur
- **PDF Raporları** — Confusion matrix, metrikler ve karbon emisyon tahmini içeren otomatik rapor üretimi
- **Ağ Görselleştirme** — Model mimarisini katman katman görselleştir, 3D görünüm ve ONNX dönüşümü
- **Herkese Açık Workspace'ler** — Workspace'leri paylaş, arama yaparak diğer kullanlaıcıların çalışmalarını incele

## 🏗️ Teknolojiler

| Katman | Teknoloji |
|---|---|
| Backend | FastAPI, Python 3.8+, Motor (async MongoDB), Beanie ODM |
| Frontend | React 18, React Router v6, Tailwind CSS, Vite |
| Veritabanı | MongoDB |
| ML | PyTorch, torchvision, scikit-learn |
| Raporlama | ReportLab (PDF üretimi) |
| Auth | JWT (python-jose), bcrypt |

## 📁 Proje Yapısı

```
cleanai-plus/
├── backend/
│   ├── main.py                   # FastAPI uygulaması giriş noktası
│   ├── requirements.txt
│   └── app/
│       ├── config.py             # Yapılandırma (dotenv)
│       ├── dependencies.py       # Auth dependency injection
│       ├── database/             # MongoDB bağlantı yönetimi
│       ├── models/               # Pydantic/Beanie veri modelleri
│       │   ├── auth/             # Kullanıcı modelleri
│       │   ├── workspace/        # Workspace, yürütme, optimizasyon
│       │   └── dataset/          # Dataset modelleri
│       ├── routers/              # API endpoint tanımları
│       │   ├── auth/             # Kayıt, giriş, email doğrulama
│       │   ├── workspace/        # Workspace CRUD & işlemleri
│       │   ├── dataset/          # Dataset yönetimi
│       │   ├── ai_model.py       # Model yönetimi
│       │   ├── code_assist.py    # AI kod asistanı
│       │   └── users.py          # Kullanıcı profili
│       ├── services/             # İş mantığı katmanı
│       │   ├── workspace/
│       │   │   ├── execution_service.py    # Model inference & metrikler
│       │   │   ├── optimization_service.py # Budama & optimizasyon
│       │   │   └── preprocessing_service.py
│       │   ├── report_service.py           # PDF rapor üretimi
│       │   └── email_service.py
│       └── utils/
│           ├── security.py       # JWT & şifreleme yardımcıları
│           └── cifar10_resnet_transforms.py
│
├── frontend/
│   └── src/
│       ├── pages/                # Sayfa bileşenleri
│       │   ├── LandingPage.jsx   # Ana sayfa (public workspace arama dahil)
│       │   ├── DashboardPage.jsx
│       │   ├── WorkspaceDetailPage.jsx  # Workspace & tab yönetimi
│       │   ├── NewWorkspacePage.jsx
│       │   ├── NewDatasetPage.jsx
│       │   ├── NewModelPage.jsx
│       │   └── Model3DPage.jsx   # 3D model görselleştirme
│       ├── components/
│       │   ├── workspace/
│       │   │   ├── PreprocessingTab.jsx   # Sürükle-bırak & kod editörü
│       │   │   ├── ExecutionTab.jsx       # Inference çalıştırma & raporlar
│       │   │   ├── NetworkOptimizationTab.jsx
│       │   │   └── NetworkVisualizationTab.jsx
│       │   ├── layout/           # Navbar, AuthLayout
│       │   ├── common/           # Button, Modal, CodeEditor vb.
│       │   └── profile/
│       ├── context/              # Auth, Toast, Alert context'leri
│       └── services/             # API istemci katmanı
│
├── docker-compose.yml
├── start.ps1                     # Windows tek-komut başlatıcı
├── start-local.ps1               # Yerel geliştirme başlatıcı
└── start.sh                      # Linux/Mac başlatıcı
```

## 🛠️ Kurulum

### Gereksinimler

- Python 3.8+
- Node.js 18+
- MongoDB (yerel veya MongoDB Atlas)

### Hızlı Başlangıç

**1. Repository'yi klonla:**
```bash
git clone https://github.com/your-org/cleanai-plus.git
cd cleanai-plus
```

**2. Environment dosyasını hazırla:**
```bash
# Windows
copy backend\.env.example backend\.env

# Linux/Mac
cp backend/.env.example backend/.env
```

**3. `.env` dosyasını düzenle:**
```env
MONGODB_URL=mongodb://localhost:27017
DATABASE_NAME=cleanai_plus
SECRET_KEY=your-secret-key-here
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SENDER_EMAIL=your@email.com
SENDER_PASSWORD=your-app-password
FRONTEND_URL=http://localhost:5173
```

**4. Uygulamayı başlat:**

```powershell
# Windows PowerShell
.\start-local.ps1
```

```bash
# Linux/Mac
chmod +x start.sh && ./start.sh
```

```bash
# NPM ile (cross-platform)
npm install && npm run dev
```

Başlatma scripti otomatik olarak:
- ✅ Eksik Python bağımlılıklarını yükler
- ✅ Backend'i başlatır → http://localhost:8000
- ✅ Frontend'i başlatır → http://localhost:5173

### Docker ile Kurulum

```bash
# Tüm servisleri başlat (MongoDB + Backend + Frontend)
docker-compose up -d

# Logları izle
docker-compose logs -f

# Durdur
docker-compose down
```

### Manuel Kurulum

#### Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
python main.py
```

Backend: http://localhost:8000  
API Docs (Swagger): http://localhost:8000/docs

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173

## 🔑 Environment Değişkenleri

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| `MONGODB_URL` | MongoDB bağlantı adresi | `mongodb://localhost:27017` |
| `DATABASE_NAME` | Veritabanı adı | `cleanai_plus` |
| `SECRET_KEY` | JWT imzalama anahtarı | — |
| `ALGORITHM` | JWT algoritması | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token geçerlilik süresi | `30` |
| `SMTP_SERVER` | E-posta sunucusu | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SENDER_EMAIL` | Gönderen e-posta adresi | — |
| `SENDER_PASSWORD` | Uygulama şifresi | — |
| `FRONTEND_URL` | E-postalardaki link için frontend URL | `http://localhost:5173` |

## 🔥 API Endpoint'leri

| Prefix | Açıklama |
|---|---|
| `GET /health` | Sağlık kontrolü |
| `POST /api/auth/register` | Kullanıcı kaydı |
| `POST /api/auth/login` | Giriş (JWT token) |
| `GET /api/users/me` | Profil bilgisi |
| `GET /api/workspaces/public/search` | Herkese açık workspace arama |
| `GET /api/workspaces/` | Kullanıcının workspace'leri |
| `POST /api/workspaces/` | Yeni workspace oluştur |
| `GET /api/workspaces/{id}/models/` | Workspace modelleri |
| `POST /api/workspaces/{id}/executions/` | Yeni inference çalıştır |
| `POST /api/workspaces/{id}/optimizations/` | Model budama başlat |
| `GET /api/workspaces/{id}/preprocessing/` | Önişleme pipeline'ları |
| `GET /api/workspaces/{id}/datasets/` | Workspace dataset'leri |

Tam API dokümantasyonu: http://localhost:8000/docs

## 📦 Production Build

```bash
# Frontend build
cd frontend
npm run build

# Backend (uvicorn ile)
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

## 📄 Lisans

MIT

---

**CleanAI+** — FARM Stack ile geliştirilmiştir 🚀

