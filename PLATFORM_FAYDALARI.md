# CleanAI+ Platformunun Kullanıcılara ve Literatüre Sağladığı Faydalar

---

## 1. Genel Bakış

Bir derin öğrenme modelinin eğitimden sonraki yaşam döngüsü — değerlendirme, optimize etme, sıkıştırma, belgeleme ve dağıtıma hazırlama — geleneksel yöntemlerde onlarca araç ve manuel betik zinciri gerektirmektedir. CleanAI+, bu zincirin tamamını tek bir web arayüzü altında birleştirerek araştırmacılara ve geliştiricilere somut zaman, enerji ve iş gücü tasarrufu sağlamaktadır. Aşağıda platformun ölçtüğü, raporladığı ve doğrudan ürettiği faydalar başlıklar halinde ele alınmaktadır.

---

## 2. Performans Değerlendirme: Kapsamlı ve Otomatik Metrik Üretimi

### 2.1. Klasifikasyon Metrikleri

Bir modeli belirli bir veri seti üzerinde elle değerlendirmek; veri yükleme, önişleme uygulaması, batch inference döngüsü ve metrik hesaplama adımlarını içeren uzun bir süreçtir. CleanAI+, bu sürecin tamamını otomatikleştirir ve tek bir butona basarak aşağıdaki metriklerin tamamını hesaplar:

| Metrik                      | Açıklama                                                                       |
| --------------------------- | ------------------------------------------------------------------------------ |
| **Accuracy**                | Genel doğruluk oranı                                                           |
| **Top-5 Accuracy**          | En yüksek olasılıklı 5 tahmin içinde doğru sınıfın bulunma oranı               |
| **Precision / Recall / F1** | Ağırlıklı ortalama (weighted), sınıf dengesizliğine karşı robust               |
| **Loss**                    | Ortalama cross-entropy kaybı                                                   |
| **Confusion Matrix**        | Tam $N \times N$ matris; modelin hangi sınıfları karıştırdığını görselleştirir |
| **Per-Class Accuracy**      | Her sınıf için ayrı doğruluk, en başarılı ve en başarısız sınıflar listelenir  |

Bu metriklerin elle hesaplanması, özellikle büyük veri setlerinde saatler alabilen ve hata yapmaya açık bir süreçtir. Platform bu hesaplamaları arka planda, thread pool üzerinde yürüterek asenkron biçimde tamamlar; kullanıcı süreç boyunca ilerlemeyi gerçek zamanlı takip edebilir.

### 2.2. Hesaplama Verimliliği Metrikleri

Performans değerlendirmesinin ötesinde, platform modelin **hesaplama maliyetini** de ölçer:

| Metrik                    | Birim                  | Açıklama                                         |
| ------------------------- | ---------------------- | ------------------------------------------------ |
| **GFLOPs/örnek**          | 10⁹ kayan nokta işlemi | `thop` kütüphanesiyle ölçülen model karmaşıklığı |
| **Çıkarım süresi**        | ms/örnek               | Tek bir görüntü için ortalama gecikme            |
| **Toplam çalışma süresi** | saniye                 | Tüm veri seti üzerindeki toplam süre             |

Bu metrikler, araştırmacıların model mimarilerini yalnızca doğruluk değil; **verimlilik açısından da** karşılaştırmasına olanak tanımaktadır.

---

## 3. Enerji ve Karbon Ayak İzi Ölçümü: Yeşil Yapay Zekaya Katkı

CleanAI+'ın öne çıkan özelliklerinden biri, her çalıştırma işlemi sırasında **codecarbon** kütüphanesi aracılığıyla otomatik enerji ve karbon emisyonu ölçümü yapmasıdır.

### 3.1. Ölçülen Büyüklükler

| Metrik                     | Birim   | Açıklama                                                              |
| -------------------------- | ------- | --------------------------------------------------------------------- |
| **Toplam enerji tüketimi** | Joule   | Tüm veri seti üzerindeki inference süresinde harcanan enerji          |
| **Örnek başı enerji**      | J/örnek | Tek bir görüntünün işlenmesi için harcanan enerji                     |
| **GFLOPs/Joule**           | —       | Enerji başına gerçekleştirilen hesaplama miktarı (enerji verimliliği) |
| **CO₂ emisyonu**           | gram    | Toplam karbon ayak izi                                                |
| **CO₂ emisyonu/dakika**    | g/dak   | Çalışma hızına göre normalize edilmiş emisyon                         |

### 3.2. Sağlanan Fayda

Derin öğrenme modellerinin çevresel maliyeti giderek daha fazla sorgulanmaktadır. CleanAI+, her modelin her çalıştırma işlemi için bu maliyeti ölçülebilir kılmaktadır. Araştırmacılar; aynı doğruluk düzeyindeki iki modeli karşılaştırırken karbon verimliliklerini de değerlendirebilir, budama veya kuantizasyon sonrasında enerji tasarrufunu sayısal olarak raporlayabilir. Bu özellik, **başka hiçbir açık kaynak ML yönetim platformunda otomatik entegrasyon şeklinde sunulmamaktadır** ve literatüre somut bir metodolojik katkı niteliği taşımaktadır.

---

## 4. Model Sıkıştırma: Boyut, Hız ve Verimlilik Kazanımları

### 4.1. Yapısal Budama (Structural Pruning)

CleanAI+, budama öncesi ve sonrası modeli otomatik olarak kıyaslayarak aşağıdaki değişimleri ölçer:

| Metrik                               | Açıklama                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| **Parametre azalması (%)**           | Toplam model parametresindeki yüzdelik düşüş                                 |
| **FLOPs azalması (%)**               | Hesaplama karmaşıklığındaki yüzdelik düşüş (FLOPs = 2 × MACs)                |
| **Çıkarım süresi (ms) — önce/sonra** | Budama öncesi ve sonrası gecikme, 3 tur ortanca ölçüm                        |
| **Throughput — önce/sonra**          | Saniyede işlenen örnek sayısı, önce/sonra karşılaştırması                    |
| **Katman bazlı kanal değişimleri**   | Her katmanın giriş/çıkış kanalları ve parametre sayısının önce/sonra tablosu |

Budama sonucunda oluşan model, orijinal modelden bağımsız olarak workspace'e kaydedilir. Kullanıcı dilerse budanmış modeli inference'a sokarak **doğruluk-boyut dengesi** eğrisini aynı platform üzerinde analiz edebilir.

Gerçek dünyadan beklenen tipik kazanımlar, budama oranına (%30–%70 aralığı) ve seçilen kritere göre değişmekle birlikte şu aralıklarda gözlemlenmektedir:

- **%30–%70 parametre azalması** → Modelin hafıza ve depolama ayak izi ciddi ölçüde küçülür.
- **%20–%60 FLOPs azalması** → Donanımdan bağımsız teorik hız artışı.
- **%1,5×–3× throughput artışı** → Gerçek çıkarım hızında ölçülen kazanım.

### 4.2. Kuantizasyon (Quantization)

INT8 kuantizasyonu sonrasında platform şu metrikleri raporlar:

| Metrik                               | Açıklama                                                         |
| ------------------------------------ | ---------------------------------------------------------------- |
| **Dosya boyutu (byte) — önce/sonra** | Model dosyasının disk boyutu karşılaştırması                     |
| **Boyut azalması (%)**               | FP32 → INT8 dönüşümünde tipik olarak **%50–%75** disk tasarrufu  |
| **Çıkarım süresi (ms) — önce/sonra** | INT8 aritmetiğinin CPU'da sağladığı hızlanma                     |
| **Speedup faktörü**                  | $\text{speedup} = t_{\text{önce}} / t_{\text{sonra}}$            |
| **Throughput — önce/sonra**          | Normalized örnekleme hızı                                        |
| **Önerilen dağıtım hedefi**          | Platforma hangi donanım/ortamın uygun olduğu otomatik belirlenir |

Kuantizasyon özellikle **gömülü sistemler ve edge cihazlar** için kritik önem taşımaktadır; CleanAI+ bu süreci tek bir tıkla erişilebilir kılmaktadır.

---

## 5. Yeniden Üretilebilirlik ve Deney Yönetimi

Bilimsel araştırmaların temel kriterlerinden biri **yeniden üretilebilirliktir**. CleanAI+ bu ilkeyi platform düzeyinde güvence altına alır:

- **Önişleme pipeline'larının versiyonlanması**: Her çalıştırma kaydı, hangi transform'ların hangi parametrelerle uygulandığını tam olarak saklar. Bir kullanıcının başkasının workspace'ini incelemesi durumunda, deneylerini bire bir tekrar etmesi mümkündür.
- **Execution kaydı**: Her inference çalıştırması; model ID, dataset ID, preprocessing ID, konfigürasyon ve tüm metriklerle birlikte kalıcı olarak MongoDB'de saklanır.
- **Optimizasyon kaydı**: Pruning ve quantization işlemleri; budama oranı, kriter, iterasyon sayısı ve elde edilen sonuçlarla birlikte izlenebilir.
- **ZIP dışa aktarma**: Tüm workspace içeriği (model dosyaları, veri setleri, preprocessing tanımları, raporlar, metrikler) tek bir paket halinde dışa aktarılabilir. Bu özellik, çalışmaların paylaşılmasını ve arşivlenmesini kolaylaştırır.

---

## 6. Otomatik Raporlama: Araştırma Belgelendirmesinin Hızlanması

Elle rapor yazmak araştırmacıların önemli bir zaman dilimini tüketir. CleanAI+, her başarılı çalıştırma sonrasında **tek tıkla profesyonel bir PDF raporu** üretir. Rapor şunları içerir:

- Model adı, veri seti, önişleme adımları
- Doğruluk, F1, precision/recall metrikleri
- Tam confusion matrix görselleştirmesi
- Sınıf bazlı doğruluk çubuk grafiği (en iyi ve en kötü sınıflar öne çıkarılır)
- Tahmini karbon emisyonu ve toplam enerji tüketimi
- Özelleştirilmiş tasarım ve kurumsal marka kimliği

Bu raporlar, makale eki, teknik sunum veya proje dokümantasyonu olarak doğrudan kullanılabilecek kalitededir.

---

## 7. Model Yorumlanabilirliği ve Mimarinin Anlaşılması

Bir modelin ne yaptığını anlamak, budama ve optimizasyon kararlarında kritik öneme sahiptir. Platform iki katmanlı görselleştirme sunar:

- **Katman tablosu**: Conv, Linear, BatchNorm vb. katmanların türü, giriş/çıkış boyutları ve parametre sayıları tablo halinde listelenir. Budama yapılacaksa hangi katmanlara odaklanılacağı buradan analiz edilebilir.
- **3D nöral ağ görselleştirmesi**: TensorSpace.js ve Three.js kullanılarak model mimarisi interaktif 3D sahnede görselleştirilir. Katmanlar arası bağlantılar ve aktivasyon akışları somut biçimde izlenebilir.

Bu özellik, özellikle hangi katmanların budanmaya uygun olduğunu seçmede kullanıcıya sezgisel bir kavrayış sağlar.

---

## 8. Geliştirici Verimliliği: IDE Deneyimi Tarayıcıya Taşınır

Önişleme pipeline'larını Python kodunda yazmak, geleneksel yaklaşımda yerel bir Python ortamı, editör ve terminal gerektirmektedir. CleanAI+'ın Monaco Editor + Jedi entegrasyonu bu deneyimi tarayıcıya taşır:

- **Gerçek zamanlı otomatik tamamlama**: Modül, sınıf, fonksiyon, keyword düzeyinde kod önerileri, WebSocket üzerinden anlık iletilir.
- **Hover dokümantasyonu**: İmleç bir sembolün üzerine getirildiğinde, o sembolün tam Python docstring'i gösterilir.
- **Monaco Editor `completionItemKind` eşlemesi**: Önerilerin tipi (modül, fonksiyon, sınıf, keyword vb.) Monaco UI'ında renklendirilmiş ikonlarla görüntülenir.

Bu özellik; platform üzerinde çalışmak için yerel Python kurulumu ve IDE gerektirmediği anlamına gelir. Araştırmacılar ön işleme kodlarını doğrudan tarayıcıda yazıp kayıt edebilir.

---

## 9. Literatüre Özgün Katkılar

### 9.1. Neuron Coverage Tabanlı Budama Kriteri

`NeuronCoverageImportance`, gerçek veri üzerindeki aktivasyon davranışını temel alan, **CleanAI+ ile literatüre sunulan özgün bir budama önem kriteridir**. Mevcut kriterlerden (magnitude, Taylor, WANDA, LAMP, FPGM) yalnızca ileri geçiş (forward pass) ve etiketsiz veri gerektirmesi bakımından metodolojik olarak ayrışmaktadır. Detaylar [NEURON_COVERAGE_KRITERI.md](NEURON_COVERAGE_KRITERI.md) belgesinde aktarılmaktadır.

### 9.2. Enerji Verimliliği Metriği: GFLOPs/Joule

Platformun hesapladığı **GFLOPs/Joule** değeri, bir modelin birim enerji başına ne kadar hesaplama yapabildiğini ölçen bileşik bir verimlilik metriğidir. Bu değer, budama veya kuantizasyon öncesi/sonrası karşılaştırmada modelin _hem hızlandığını hem de enerji verimliliğinin arttığını_ tek bir metrikle ortaya koyar. Araştırmacılar bu metriği iki farklı modeli ya da iki farklı sıkıştırma stratejisini doğrudan karşılaştırmak için kullanabilir.

### 9.3. Tutarlı ve Karşılaştırılabilir Deney Çerçevesi

Farklı makaleler farklı araçlar, farklı ölçüm yöntemleri ve farklı raporlama pratikleri kullanmaktadır. CleanAI+, standartlaştırılmış bir deney çerçevesi sunarak aynı platform üzerinde yürütülen tüm deneylerin aynı ölçüm metodolojisiyle raporlanmasını sağlar. Bu durum, sonuçların literatürde doğrudan karşılaştırılabilirliğini artırmaktadır.

---

## 10. Platform Kullanımının Somut Kazanımları

Aşağıdaki tablo, platforma erişimin olmadığı geleneksel yaklaşım ile CleanAI+ kullanımını karşılaştırmaktadır:

| Görev                                | Geleneksel Yaklaşım                                            | CleanAI+ ile                                |
| ------------------------------------ | -------------------------------------------------------------- | ------------------------------------------- |
| Inference + tam metrik hesaplama     | Betik yazma, veri yükleme, sklearn entegrasyonu: **30–90 dak** | Yapılandırma + çalıştır: **2–5 dak**        |
| Confusion matrix görselleştirme      | Matplotlib kodu: **15–30 dak**                                 | Otomatik, çalıştırma tamamlanır tamamlanmaz |
| Enerji ve karbon ölçümü              | codecarbon entegrasyonu, ortam kurulumu: **1–2 saat**          | Otomatik, her çalıştırmada                  |
| Model budama                         | torch-pruning kurulumu, kriter kodu, kaydetme: **2–4 saat**    | UI üzerinden yapılandırma: **5–10 dak**     |
| Önce/sonra benchmark karşılaştırması | Manuel zamanlama ve parametreler: **30–60 dak**                | Otomatik, budama tamamlandığında            |
| PDF rapor hazırlama                  | Elle düzenleme: **2–4 saat**                                   | Tek tıkla, otomatik PDF                     |
| Önişleme pipeline'ı tanımlama        | Yerel Python + IDE: değişken                                   | Tarayıcıda kod editörü veya sürükle-bırak   |
| Deney arşivleme                      | Manuel dosya yönetimi                                          | Workspace ZIP olarak dışa aktarma           |

---

## 11. Özet

CleanAI+, derin öğrenme model geliştirme sürecinin eğitim sonrası aşamalarını — değerlendirme, optimizasyon, görselleştirme, belgeleme ve paylaşım — tek bir bütünleşik platformda ele alarak araştırmacılara ve geliştiricilere şu temel faydaları sağlamaktadır:

1. **Zaman tasarrufu**: Onlarca saatlik betik yazma ve araç entegrasyonu işinin büyük çoğunluğu ortadan kalkar.
2. **Enerji ve maliyet azaltımı**: Budama ve kuantizasyon ile modeller dağıtım öncesinde küçültülür; çalışma zamanı enerji tüketimi doğrudan ölçülür.
3. **Yeniden üretilebilirlik**: Her deneyin tüm konfigürasyonu ve sonuçları kalıcı olarak izlenebilir.
4. **Erişilebilirlik**: Yerel Python ortamı gerektirmeksizin tarayıcı üzerinden tam bir ML iş akışı yürütülebilir.
5. **Bilimsel şeffaflık**: Public workspace'ler ve ZIP dışa aktarma ile çalışmalar toplulukla paylaşılabilir.
6. **Literatür katkısı**: Neuron Coverage kriteri, GFLOPs/Joule metriği ve enerji ölçümünün budama döngüsüne entegrasyonu özgün metodolojik katkılar olarak öne çıkmaktadır.
