# CleanAI Plus

FARM Stack (FastAPI + React + MongoDB) mimarisini kullanan modern web uygulaması.

## 🚀 Teknolojiler

- **Backend:** FastAPI (Python)
- **Frontend:** React + Tailwind CSS
- **Database:** MongoDB
- **Build Tool:** Vite

## 📁 Proje Yapısı

```
cleanai-plus/
├── backend/
│   ├── app/
│   │   ├── database/       # MongoDB bağlantı yönetimi
│   │   ├── models/         # Pydantic modelleri
│   │   ├── routers/        # API endpoint'leri
│   │   ├── services/       # İş mantığı katmanı
│   │   ├── config.py       # Yapılandırma ayarları
│   │   └── __init__.py
│   ├── main.py             # FastAPI uygulaması
│   ├── requirements.txt    # Python bağımlılıkları
│   └── .env.example        # Örnek environment dosyası
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx         # Ana React bileşeni
│   │   ├── main.jsx        # React giriş noktası
│   │   └── index.css       # Tailwind CSS
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
│
└── .github/
    └── copilot-instructions.md
```

## 🛠️ Kurulum

### Gereksinimler

- Python 3.8+
- Node.js 18+
- MongoDB (yerel veya MongoDB Atlas)

### Hızlı Başlangıç (Önerilen)

**1. Backend Virtual Environment Oluştur:**
```bash
cd backend
python -m venv venv
cd ..
```

**2. Environment Dosyasını Hazırla:**
```bash
copy backend\.env.example backend\.env
# .env dosyasında MongoDB ayarlarını düzenleyin
```

**3. Tek Komutla Başlat:**

**Windows PowerShell:**
```powershell
.\start.ps1
```

**Linux/Mac:**
```bash
chmod +x start.sh
./start.sh
```

**NPM ile (Cross-platform):**
```bash
npm install
npm run dev
```

Script otomatik olarak:
- ✅ Eksik bağımlılıkları kontrol eder
- ✅ Backend'i başlatır (http://localhost:8000)
- ✅ Frontend'i başlatır (http://localhost:5173)
- ✅ İki ayrı terminal penceresi açar

### Manuel Kurulum

#### Backend Kurulumu

```bash
cd backend

# Virtual environment oluştur
python -m venv venv

# Virtual environment'ı aktifleştir
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Bağımlılıkları yükle
pip install -r requirements.txt

# Environment dosyasını oluştur
copy .env.example .env
# Gerekli ayarları .env dosyasında düzenle

# Uygulamayı başlat
python main.py
```

Backend şu adreste çalışacak: http://localhost:8000

#### Frontend Kurulumu

```bash
cd frontend

# Bağımlılıkları yükle
npm install

# Development server'ı başlat
npm run dev
```

Frontend şu adreste çalışacak: http://localhost:5173

### Docker ile Kurulum

```bash
# Tüm servisleri başlat (MongoDB + Backend + Frontend)
docker-compose up -d

# Logları izle
docker-compose logs -f

# Durdur
docker-compose down
```

## 📝 Environment Değişkenleri

Backend `.env` dosyasında şu değişkenleri ayarlayın:

```env
MONGODB_URL=mongodb://localhost:27017
DATABASE_NAME=cleanai_plus
ENVIRONMENT=development
```

## 🔥 API Endpoints

- `GET /` - Ana endpoint
- `GET /health` - Sağlık kontrolü

API dokümantasyonu: http://localhost:8000/docs

## 🎨 Özellikler

- ✅ Clean Code mimarisi
- ✅ Async/Await ile veritabanı işlemleri
- ✅ CORS yapılandırması
- ✅ Modüler yapı (routers, services, models)
- ✅ Modern UI (Tailwind CSS)
- ✅ Hot reload (hem backend hem frontend)

## 🚦 Geliştirme

### Backend Geliştirme

Backend kodu `backend/app/` dizininde organize edilmiştir:

- **routers/**: API endpoint tanımlamaları
- **services/**: İş mantığı
- **models/**: Veri modelleri
- **database/**: Veritabanı bağlantısı

### Frontend Geliştirme

React bileşenleri `frontend/src/` dizininde bulunur. Tailwind CSS kullanarak stil uygulanır.

## 📦 Production Build

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm run build
npm run preview
```

## 🤝 Katkıda Bulunma

Projeye katkıda bulunmak için pull request gönderebilirsiniz.

## 📄 Lisans

MIT

---

**CleanAI Plus** - FARM Stack ile geliştirilmiştir 🚀
