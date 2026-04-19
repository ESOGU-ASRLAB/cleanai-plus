# CleanAI+ — Proje Dokümantasyonu

## 1. Proje Genel Bakış

**CleanAI+**, PyTorch tabanlı yapay zeka modellerini analiz etmek, optimize etmek ve değerlendirmek için geliştirilmiş bir **web tabanlı ML model yönetim platformudur**. Kullanıcılar kendi modellerini ve veri setlerini platforma yükleyerek; çıkarım (inference) çalıştırabilir, modeli budayabilir (pruning), nicelleştirebilir (quantization), görselleştirebilir ve profesyonel PDF raporlar üretebilir.

Platform **FARM Stack** mimarisi üzerine inşa edilmiştir:

| Katman       | Teknoloji                                      |
|--------------|------------------------------------------------|
| **Backend**  | FastAPI (Python), Motor (async MongoDB), Beanie ODM |
| **Frontend** | React 18, React Router v6, Tailwind CSS, Vite  |
| **Veritabanı** | MongoDB                                      |
| **ML**       | PyTorch, torchvision, torch-pruning, ONNX Runtime, safetensors |
| **Raporlama** | ReportLab (PDF), codecarbon (karbon ölçümü)  |
| **Kimlik Doğrulama** | JWT (python-jose), bcrypt             |

---

## 2. Temel Özellikler

### 2.1. Workspace Sistemi
Her kullanıcı izole **workspace**'ler oluşturur. Workspace içinde modeller, veri setleri, önişleme pipeline'ları, çalıştırma ve optimizasyon işleri bir arada tutulur. Workspace'ler **public** veya **private** olarak ayarlanabilir; public workspace'ler landing page üzerinden herkes tarafından aranabilir ve incelenebilir.

### 2.2. AI Model Yönetimi
Desteklenen model formatları:
- `state_dict` — PyTorch ağırlık dosyası (`.pt`, `.pth`)
- `full_model` — Tam PyTorch modeli (`.pt`, `.pth`, `.pkl`)
- `torchscript` — TorchScript (`.pt`, `.pth`)
- `safetensors` — SafeTensors formatı
- `checkpoint` — Eğitim checkpoint'i
- `onnx` — ONNX modeli

Modeller, opsiyonel bir **tanım dosyasıyla** (model mimarisini içeren Python dosyası) birlikte yüklenebilir. Her model bir workspace'e ait olup aynı workspace altında birden fazla model bulunabilir.

### 2.3. Veri Seti Yönetimi
Desteklenen veri seti türleri:
- **CIFAR-10 pickle batch'leri** — Otomatik sınıf ve label tespiti
- **ImageNet tarzı klasör yapısı** — `class_name/image.jpg` hiyerarşisi
- **Özel pickle dosyaları**

Her veri seti, sınıf listesi, dosya sayısı ve boyut bilgisiyle birlikte MongoDB'de saklanır. Örnek görseller de kaydedilir.

### 2.4. Önişleme (Preprocessing) Pipeline
İki modda önişleme pipeline'ı oluşturulabilir:

- **UI Modu (Sürükle-Bırak)**: Kullanıcı arayüzündeki hazır transform bloklarını sürükleyip bırakarak sıralı bir pipeline tanımlar. Desteklenen transform'lar:
  - `Resize`, `CenterCrop`, `RandomHorizontalFlip`, `Normalize`, `ToTensor`, `Grayscale`
- **Kod Modu**: Monaco tabanlı Python editöründe `get_transform()` fonksiyonu doğrudan yazılır. WebSocket üzerinden **Jedi** ile otomatik tamamlama ve hover dokümantasyonu sağlanır.

UI modunda tanımlanan pipeline, arka planda eşdeğer Python koduna otomatik çevrilir.

### 2.5. Model Çalıştırma (Execution / Inference)
Kullanıcı bir workspace içinde model + veri seti + (opsiyonel) önişleme pipeline seçerek inference çalıştırır. Sistem şu metrikleri hesaplar:

- **Genel Doğruluk (Accuracy)**
- **Precision / Recall / F1 Score** (macro ve weighted)
- **Sınıf Bazında Metrikler** (per-class accuracy, sensitivity)
- **Confusion Matrix**
- **FLOPs & Parametre Sayısı** (thop kütüphanesi ile)
- **Enerji & Karbon Emisyonu** (codecarbon kütüphanesi ile)
- **Çalışma Süresi**

Çalışma durumu (`pending → running → completed/failed`) gerçek zamanlı izlenebilir; ilerleme yüzdesi polling ile frontend'e iletilir. İşlem istenildiği zaman **iptal** edilebilir.

**ONNX modelleri** için `ONNXModelWrapper` kullanılır; CPU ve CUDA provider desteği mevcuttur.

### 2.6. Ağ Optimizasyonu (Network Pruning)
**torch-pruning** kütüphanesi ile yapısal katman budama gerçekleştirilir. Desteklenen önem kriteriyöntemleri:

| Kriter | Açıklama |
|--------|----------|
| `magnitude_l1` / `magnitude_l2` | L1/L2 ağırlık büyüklüğü |
| `taylor` | Taylor açılımına dayalı gradyan × aktivasyon |
| `activation` | Aktivasyon tabanlı önem |
| `neuron_coverage` | Nöron kapsama analizi |
| `wanda` | Weight × Activations Norm (SparseGPT türevi) |
| `lamp` | Layer-Adaptive Magnitude Pruning |
| `fpgm` | Filter Pruning via Geometric Median |
| `bn_scale` | Batch Normalization ölçek faktörü |
| `random` | Rastgele budama |

Yapılandırılabilir parametreler:
- `pruning_ratio` — Budama oranı
- `iterative_steps` — Aşamalı budama adım sayısı
- `global_pruning` — Global veya layer-wise budama
- `max_pruning_ratio`, `round_to`, `isomorphic`
- `ignored_layer_names` — Korunacak katmanlar
- `ignore_head` — Son sınıflandırma katmanını koruma

Budama sonucunda oluşan optimize model, workspace'e yeni bir model olarak kaydedilir (`is_optimized=True`).

### 2.7. Kuantizasyon (Quantization)
PyTorch'un yerleşik kuantizasyon araçları kullanılarak model boyutu küçültülür. Desteklenen arka uçlar: `fbgemm` (CPU/Intel), `qnnpack` (ARM/mobil). Sonuç model aynı şekilde workspace'e kaydedilir.

### 2.8. Model Görselleştirme
**İki katmanlı görselleştirme** sunulur:

1. **NetworkVisualizationTab** — Model katman listesi, parametre sayısı, katman türü ve boyutları tablo halinde gösterilir. Modeli ONNX'e dönüştürme ve `TF.js` dönüşüm pipeline'ı da buradan tetiklenir.

2. **Model3DPage** — `TensorSpace.js` ve `Three.js` ile 3 boyutlu nöral ağ görselleştirmesi. Katmanlar arası bağlantılar ve aktivasyon akışları 3D sahnede render edilir.

### 2.9. Workspace Dışa Aktarma (Export)
Workspace içeriği, seçilebilir bileşenlerle ZIP olarak dışa aktarılır:

- Preprocessing tanımları, çalıştırma kayıtları, optimizasyon/kuantizasyon sonuçları
- Veri seti dosyaları, model dosyaları, PDF raporlar, aktivite logları
- Metrik verileri (confusion matrix dahil)

Dışa aktarma **Server-Sent Events (SSE)** ile sağlanan gerçek zamanlı ilerleme çubuğuyla gerçekleşir.

### 2.10. PDF Rapor Üretimi
`ReportLab` kullanarak oluşturulan profesyonel PDF raporları şunları içerir:

- Model adı, veri seti, önişleme adımları
- Doğruluk, F1, precision/recall metrikleri
- Confusion matrix görsel tablosu
- Sınıf bazında doğruluk bar grafiği
- Tahmini karbon emisyonu ve enerji tüketimi
- CleanAI+ marka tasarımı (özel renk paleti, logo)

### 2.11. Kimlik Doğrulama & Kullanıcı Yönetimi
- **Kayıt** — E-posta + şifre (bcrypt hash), tam ad
- **E-posta Doğrulama** — SMTP üzerinden 6 haneli kod gönderimi; hesap doğrulanmadan bazı özellikler kısıtlanır
- **JWT Giriş** — 480 dakika (8 saat) geçerli erişim tokeni
- **Profil** — Avatar yükleme, şifre değiştirme, bildirim tercihleri
- **Aktivite Logu** — Model yükleme, çalıştırma başlatma, optimizasyon vb. aksiyonlar zaman damgasıyla kaydedilir

### 2.12. AI Kod Asistanı
Monaco Editor entegrasyonu + **WebSocket tabanlı Jedi** destekli Python kod asistanı:
- Gerçek zamanlı **otomatik tamamlama** (modül, sınıf, fonksiyon, keyword)
- **Hover dokümantasyonu** — İmleç üzerindeki sembol için docstring gösterimi
- Monaco Editor `completionItemKind` eşlemesi

---

## 3. Proje Yapısı

```
cleanai-plus/
├── backend/
│   ├── main.py                          # FastAPI uygulama giriş noktası
│   ├── requirements.txt                 # Python bağımlılıkları
│   └── app/
│       ├── config.py                    # Ortam değişkenleri (JWT, SMTP, MongoDB)
│       ├── dependencies.py              # JWT doğrulama dependency
│       ├── database/mongodb.py          # Motor async bağlantı yönetimi
│       ├── models/
│       │   ├── ai_model.py             # AIModelInDB, ModelFormat enum
│       │   ├── base.py                 # PyObjectId yardımcısı
│       │   ├── auth/user.py            # UserInDB, UserCreate, UserUpdate
│       │   ├── dataset/dataset.py      # Dataset (Beanie Document)
│       │   ├── workspace/workspace.py  # WorkspaceInDB, WorkspaceBase
│       │   ├── workspace/execution.py  # Execution (Beanie), ExecutionStatus
│       │   ├── workspace/optimization.py # Optimization (Beanie)
│       │   ├── workspace/quantization.py # Quantization (Beanie)
│       │   ├── workspace/preprocessing.py# Preprocessing (Beanie)
│       │   └── report.py               # Report modeli
│       ├── routers/
│       │   ├── auth/auth.py            # /auth/* endpoint'leri
│       │   ├── workspace/workspace.py  # Workspace CRUD
│       │   ├── workspace/execution.py  # Execution başlatma/iptal/progress
│       │   ├── workspace/optimization.py# Pruning başlatma/iptal/progress
│       │   ├── workspace/quantization.py# Quantization başlatma/iptal
│       │   ├── workspace/preprocessing.py# Preprocessing CRUD
│       │   ├── workspace/export.py     # ZIP dışa aktarma + SSE
│       │   ├── ai_model.py             # Model yükleme/listeleme/silme/indirme
│       │   ├── dataset/                # Dataset yükleme/listeleme/silme
│       │   ├── code_assist.py          # WebSocket Jedi kod asistanı
│       │   ├── users.py                # Profil güncelleme, avatar
│       │   └── health.py               # Sağlık kontrolü
│       ├── services/
│       │   ├── workspace/execution_service.py    # Inference pipeline
│       │   ├── workspace/optimization_service.py # Pruning pipeline
│       │   ├── workspace/quantization_service.py # Quantization pipeline
│       │   ├── workspace/preprocessing_service.py
│       │   ├── workspace/export_service.py       # ZIP oluşturma
│       │   ├── workspace/coverage_analyzer.py    # Nöron kapsama analizi
│       │   ├── workspace/wanda_importance.py     # WANDA önem hesabı
│       │   ├── workspace/neuron_coverage_importance.py
│       │   ├── report_service.py                 # PDF üretimi
│       │   ├── email_service.py                  # SMTP e-posta
│       │   ├── ai_model_service.py               # Model dosya yönetimi
│       │   ├── user_service.py                   # Kullanıcı işlemleri
│       │   ├── activity_service.py               # Aktivite loglama
│       │   └── auth/                             # Kayıt, giriş, doğrulama
│       └── utils/
│           ├── security.py                        # JWT oluşturma/doğrulama
│           └── cifar10_resnet_transforms.py       # CIFAR-10 özel dönüşümler
│
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── LandingPage.jsx          # Ana sayfa + public workspace arama
│       │   ├── DashboardPage.jsx        # Kullanıcının workspace listesi
│       │   ├── WorkspaceDetailPage.jsx  # Tab yönetimi, tüm workspace işlemleri
│       │   ├── NewWorkspacePage.jsx     # Workspace oluşturma formu
│       │   ├── NewDatasetPage.jsx       # Veri seti yükleme
│       │   ├── NewModelPage.jsx         # Model yükleme
│       │   ├── Model3DPage.jsx          # TensorSpace.js 3D görselleştirme
│       │   ├── ProfilePage.jsx          # Profil & ayarlar
│       │   ├── LoginPage.jsx / RegisterPage.jsx
│       │   └── VerifyEmailPage.jsx
│       ├── components/
│       │   ├── workspace/
│       │   │   ├── PreprocessingTab.jsx       # Sürükle-bırak + kod editörü
│       │   │   ├── ExecutionTab.jsx           # Inference çalıştırma & raporlar
│       │   │   ├── NetworkOptimizationTab.jsx # Pruning & quantization UI
│       │   │   ├── PruningSubTab.jsx          # Pruning alt sekmesi
│       │   │   ├── QuantizationSubTab.jsx     # Quantization alt sekmesi
│       │   │   ├── NetworkVisualizationTab.jsx# Katman tablosu & ONNX dışa aktarma
│       │   │   ├── ExecutionCompare.jsx       # Çalıştırma sonuçları karşılaştırma
│       │   │   ├── WorkspaceExportModal.jsx   # ZIP dışa aktarma modalı
│       │   │   ├── WorkspaceList.jsx          # Dashboard workspace kartları
│       │   │   └── WorkspaceSettingsTab.jsx   # İsim, açıklama, gizlilik ayarları
│       │   ├── layout/                        # Navbar, AuthLayout
│       │   ├── common/                        # Button, Modal, CodeEditor, WindowedCodeEditor
│       │   └── profile/                       # Avatar, aktivite listesi
│       ├── context/
│       │   ├── AuthContext.jsx               # Oturum durumu & JWT yönetimi
│       │   ├── ToastContext.jsx              # Bildirim toast'ları
│       │   ├── AlertContext.jsx              # Modal uyarıları
│       │   └── TourContext.jsx              # Onboarding tur sistemi
│       ├── hooks/                            # Özel React hook'ları
│       └── services/
│           ├── workspaceService.js          # API istemci (workspace endpointleri)
│           └── userService.js               # API istemci (kullanıcı endpointleri)
│
├── docker-compose.yml                       # MongoDB + Backend + Frontend servisleri
├── start.ps1                               # Windows (Docker ile) hızlı başlatıcı
├── start-local.ps1                         # Windows yerel geliştirme başlatıcısı
└── start.sh                                # Linux/macOS başlatıcı
```

---

## 4. Veri Modelleri

### 4.1. Kullanıcı (`users` koleksiyonu)
```
email, full_name, hashed_password, is_active, is_verified,
avatar_url, verification_code, verification_code_expires_at,
created_at, updated_at
```

### 4.2. Workspace (`workspaces` koleksiyonu)
```
name, description, is_public, owner_id,
preprocessing { mode, code, steps },
created_at, updated_at
```

### 4.3. AI Model (`ai_models` koleksiyonu)
```
name, description, format (enum), version,
workspace_id, owner_id, file_path, definition_file_path,
file_size_bytes, is_optimized, optimization_type,
quantization_backend, is_favorite, original_model_id,
created_at, updated_at
```

### 4.4. Dataset (`datasets` koleksiyonu)
```
workspace_id, name, description, type,
path, file_count, size_bytes,
classes (liste), samples (görsel yolları), schema_info,
created_at
```

### 4.5. Preprocessing (`preprocessing` koleksiyonu)
```
workspace_id, name, description,
mode (ui | code), code (Python), steps (liste),
created_at, updated_at
```

### 4.6. Execution (`executions` koleksiyonu)
```
workspace_id, model_id, dataset_id, preprocessing_id (opsiyonel),
status (pending|running|completed|failed|cancelled),
config {}, metrics {accuracy, f1, confusion_matrix, flops, ...},
logs [], error_message,
created_at, started_at, completed_at
```

### 4.7. Optimization (`optimizations` koleksiyonu)
```
workspace_id, model_id, dataset_id, preprocessing_id,
status, config {pruning_ratio, importance_type, iterative_steps, ...},
result {before_size, after_size, compression_ratio, ...},
output_model_id,
created_at, started_at, completed_at
```

### 4.8. Quantization (`quantizations` koleksiyonu)
```
workspace_id, model_id, dataset_id, preprocessing_id,
status, config {backend, ...}, result {...},
output_model_id,
created_at, started_at, completed_at
```

### 4.9. Report (`reports` koleksiyonu)
```
workspace_id, execution_id, type, file_path,
created_at
```

---

## 5. API Endpoint'leri

```
GET    /health                                         # Sağlık kontrolü

POST   /api/auth/register                             # Kayıt
POST   /api/auth/login                                # Giriş (JWT döner)
POST   /api/auth/verify-email                         # E-posta doğrulama
POST   /api/auth/resend-verification                  # Doğrulama kodu yeniden gönder

GET    /api/users/me                                  # Mevcut kullanıcı bilgisi
PUT    /api/users/me                                  # Profil güncelle
POST   /api/users/me/avatar                           # Avatar yükle

GET    /api/workspaces/                               # Workspace listesi
POST   /api/workspaces/                               # Workspace oluştur
GET    /api/workspaces/{id}                           # Workspace detayı
PUT    /api/workspaces/{id}                           # Workspace güncelle
DELETE /api/workspaces/{id}                           # Workspace sil

POST   /api/workspaces/{id}/models/                   # Model yükle
GET    /api/workspaces/{id}/models/                   # Model listesi
GET    /api/workspaces/{id}/models/{modelId}          # Model detayı
DELETE /api/workspaces/{id}/models/{modelId}          # Model sil
GET    /api/workspaces/{id}/models/{modelId}/download # Model indir
GET    /api/workspaces/{id}/models/{modelId}/structure# Katman yapısı

POST   /api/workspaces/{id}/datasets/                 # Veri seti yükle
GET    /api/workspaces/{id}/datasets/                 # Veri seti listesi
DELETE /api/workspaces/{id}/datasets/{dsId}           # Veri seti sil

POST   /api/workspaces/{id}/preprocessing/            # Preprocessing kaydet
GET    /api/workspaces/{id}/preprocessing/            # Preprocessing listesi

POST   /api/workspaces/{id}/executions/               # Inference başlat
GET    /api/workspaces/{id}/executions/               # Execution listesi
GET    /api/workspaces/{id}/executions/{exId}         # Execution detayı
GET    /api/workspaces/{id}/executions/{exId}/progress# İlerleme yüzdesi
POST   /api/workspaces/{id}/executions/{exId}/cancel  # İptal et
GET    /api/workspaces/{id}/executions/{exId}/report  # PDF rapor indir

GET    /api/workspaces/{id}/optimizations/model-layers/{mId} # Budanabilir katmanlar
POST   /api/workspaces/{id}/optimizations/            # Pruning başlat
GET    /api/workspaces/{id}/optimizations/            # Optimizasyon listesi
GET    /api/workspaces/{id}/optimizations/{optId}/progress  # İlerleme
POST   /api/workspaces/{id}/optimizations/{optId}/cancel    # İptal et
GET    /api/workspaces/{id}/optimizations/{optId}/download  # Optimize model indir

POST   /api/workspaces/{id}/quantizations/            # Quantization başlat
GET    /api/workspaces/{id}/quantizations/            # Quantization listesi
POST   /api/workspaces/{id}/quantizations/{qId}/cancel# İptal et

POST   /api/workspaces/{id}/export/start              # ZIP dışa aktarma başlat
GET    /api/workspaces/{id}/export/{taskId}/events    # SSE ilerleme akışı
GET    /api/workspaces/{id}/export/{taskId}/download  # ZIP indir

WS     /ws/code-assist                                # Jedi otomatik tamamlama
```

---

## 6. Mimari Akış

```
Kullanıcı (Tarayıcı)
      │
      │ HTTP/REST + WebSocket
      ▼
  React Frontend (Vite, port 5173)
      │
      │ JSON API çağrıları
      ▼
  FastAPI Backend (Uvicorn, port 8000)
      │
      ├── Auth Router       → AuthService → MongoDB (users)
      ├── Workspace Router  → WorkspaceService → MongoDB (workspaces)
      ├── Model Router      → AIModelService → Disk (uploads/workspaces/)
      ├── Dataset Router    → DatasetService → Disk + MongoDB
      ├── Execution Router  → ExecutionService → PyTorch inference
      │                        └──▶ MetricsHesaplama → MongoDB (executions)
      │                        └──▶ ReportService → Disk (uploads/reports/)
      ├── Optimization Router → OptimizationService → torch-pruning
      │                          └──▶ Yeni model → Disk + MongoDB
      ├── Quantization Router → QuantizationService → PyTorch quantize
      ├── Export Router       → ExportService → ZIP → SSE
      └── CodeAssist WS       → Jedi → WebSocket yanıtı
            │
            ▼
       MongoDB (Motor async)
       ├── users
       ├── workspaces
       ├── ai_models
       ├── datasets
       ├── preprocessing
       ├── executions
       ├── optimizations
       ├── quantizations
       └── reports
```

---

## 7. Önemli Teknik Kararlar

### Async + Thread Pool
CPU-yoğun PyTorch inference ve pruning işlemleri `asyncio.get_event_loop().run_in_executor()` ile thread pool'a taşınır. Bu sayede FastAPI'nin async event loop'u bloke edilmez.

### Gerçek Zamanlı İlerleme
İşlem süreci boyunca `_execution_progress` / `_optimization_progress` gibi in-memory sözlükler güncellenir. Frontend bu sözlükleri `/progress` endpoint'ini polling yaparak okur.

### İptal Mekanizması
Her uzun süren işlem için `_execution_cancelled`, `_optimization_cancelled`, `_quantization_cancelled` adlı `set`'ler tutulur. Background thread her batch sonrası bu set'i kontrol eder; iptal sinyali varsa işlemi durdurur.

### Beanie ODM
`Execution`, `Optimization`, `Quantization`, `Dataset`, `Preprocessing`, `Report` modelleri Beanie Document olarak tanımlanmıştır. Uygulama başlangıcında (`lifespan`) Beanie initialize edilir.

### Onboarding Turu
`TourContext` ile yeni kullanıcılara Dashboard sayfasında otomatik adım adım rehber gösterilir. `localStorage`'da gerçekleştirilip gerçekleştirilmediği saklanır; her kullanıcı için sadece bir kez gösterilir.

### ONNX/TensorSpace Pipeline
Model 3D görselleştirme için şu dönüşüm zinciri uygulanır:
`PyTorch → ONNX → TF SavedModel → TF.js` — `onnx2tf`, `tensorflowjs` kullanılarak.

---

## 8. Kurulum

### Gereksinimler
- Python 3.8+
- Node.js 18+
- MongoDB 7.0 (yerel veya Atlas)

### Docker ile (Önerilen)
```bash
docker-compose up --build
```
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- MongoDB: `localhost:27017`

### Yerel Geliştirme (Windows)
```powershell
.\start-local.ps1
```

### Yerel Geliştirme (Manuel)
```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

### Ortam Değişkenleri (`backend/.env`)
```env
MONGODB_URL=mongodb://localhost:27017
DATABASE_NAME=cleanai_plus
SECRET_KEY=<güçlü-rastgele-anahtar>
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SENDER_EMAIL=<e-posta>
SENDER_PASSWORD=<uygulama-şifresi>
FRONTEND_URL=http://localhost:5173
```

---

## 9. Kullanım Senaryosu (Tipik Akış)

1. **Kayıt & Giriş** — Kullanıcı e-posta ile kayıt olur, doğrulama kodunu girer.
2. **Workspace Oluşturma** — "New Workspace" butonuyla izole bir proje ortamı oluşturulur.
3. **Model Yükleme** — `.pt` / `.pth` / `.onnx` vb. model dosyası yüklenir; opsiyonel olarak model tanım Python dosyası eklenir.
4. **Veri Seti Yükleme** — CIFAR veya klasör yapısında veri seti yüklenir.
5. **Preprocessing Tanımlama** — Sürükle-bırak veya Python koduyla transform pipeline'ı oluşturulur.
6. **Inference Çalıştırma** — Model + veri seti + preprocessing seçilir, execution başlatılır; metrikler ve confusion matrix görüntülenir.
7. **PDF Rapor** — Execution tamamlandığında tek tıkla PDF rapor oluşturulur ve indirilebiir.
8. **Pruning / Quantization** — Optimize edilmek istenen model seçilir, kriter ve oran belirlenir, işlem başlatılır; oluşan küçük model otomatik kaydedilir.
9. **Görselleştirme** — Model katmanları tablo halinde veya 3D interaktif olarak incelenir.
10. **Dışa Aktarma** — Workspace içeriği seçimli olarak ZIP olarak dışa aktarılır.
11. **Paylaşım** — Workspace public yapılarak landing page'den diğer kullanıcılar tarafından aranabilir hale getirilir.

---

## 10. Güvenlik Notları

- Şifreler **bcrypt** ile hash'lenerek saklanır.
- JWT token'ları `HS256` algoritması ile imzalanır, varsayılan geçerlilik 8 saattir.
- CORS yalnızca `localhost:5173` ve `localhost:3000`'e izin verir (production'da güncellenmelidir).
- Model ve veri seti dosyaları `uploads/` klasörüne kaydedilir; workspace ve kullanıcı sahipliği API katmanında doğrulanır.
- E-posta doğrulaması olmadan bazı özellikler kısıtlanır.
