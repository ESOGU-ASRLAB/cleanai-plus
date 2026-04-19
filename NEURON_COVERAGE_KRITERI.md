# Neuron Coverage Tabanlı Yapısal Budama: CleanAI+'ın Özgün Önem Kriteri

## 1. Genel Tanım

Neuron Coverage kriteri, CleanAI+ platformuna literatüre yeni bir katkı olarak entegre edilmiş, **veri güdümlü (data-driven)** bir yapısal budama önem (importance) kriteridir. Temel fikir şudur: Bir nöron, kalibrasyon verisinin büyük bölümünde aktif değilse — yani pratikte "ölü" ya da "pasif" olarak davranıyorsa — o nöronun modelin karar sürecine anlamlı bir katkı sağlamadığı varsayılır ve budanmaya öncelikli aday olarak işaretlenir. Bu yaklaşım, model ağırlıklarına değil; modelin gerçek veri üzerindeki **çalışma zamanı aktivasyon davranışına** dayanmasıyla mevcut kriterlerden ayrışmaktadır.

---

## 2. Çalışma Prensibi

Kriter iki aşamalı bir süreçle hesaplanır:

### Aşama 1 — Aktivasyon İstatistiklerinin Toplanması (`CoverageAnalyzer`)

Model, budama öncesinde kullanıcının seçtiği kalibrasyon örnekleri üzerinde ileri geçişe (forward pass) tabi tutulur. Bu süreçte budanabilir her katmana (`Conv1d/2d/3d`, `Linear`, `BatchNorm`, `LayerNorm`, `GroupNorm`, `ConvTranspose2d`) PyTorch **forward hook**'ları takılır.

Her hook, ilgili katmanın çıktısını yakalayarak kanal boyutunda şu istatistikleri biriktirir:

| İstatistik     | Açıklama                                                              |
| -------------- | --------------------------------------------------------------------- |
| `sum`          | Batch ortalamasının kümülatif toplamı                                 |
| `sum_abs`      | Mutlak değer ortalamasının kümülatif toplamı                          |
| `max`          | Tüm örnekler üzerinde kanal başına görülen maksimum mutlak aktivasyon |
| `active_count` | Her kanalın aktif sayıldığı (eşik üstü) örnek oranı                   |

Uzaysal boyuta sahip katmanlarda (Conv) uzaysal boyutlar önce ortalamayla indirgenir; böylece tüm katman türlerinde tutarlı bir `[kanal]` boyutlu tensör elde edilir. Aktivasyon eşiği, katman maksimumunun %1'i olarak dinamik biçimde belirlenir: $\tau = 0{,}01 \cdot \max|\mathbf{a}|$. Bu eşiğin altında kalan bir kanal, o örnek için "aktif değil" sayılır.

### Aşama 2 — Önem Skoru Hesabı (`NeuronCoverageImportance`)

Kalibrasyon geçişinin ardından her kanal için tek bir skalar önem skoru hesaplanır. Kullanıcı, dört metrik arasından birini seçebilir:

**`normalized_mean` (varsayılan)**
$$s_c = \frac{\bar{|a_c|}}{\max_c(\bar{|a_c|}) + \varepsilon}$$
Kanalın ortalama mutlak aktivasyonu, katman genelindeki maksimuma göre normalize edilir.

**`frequency`**
$$s_c = \frac{1}{N}\sum_{i=1}^{N} \mathbf{1}\bigl[|a_c^{(i)}| > \tau\bigr]$$
Kanalın aktif olduğu örnek oranı; "ölü nöron" tespitine en doğrudan yaklaşım.

**`mean_absolute`**
$$s_c = \frac{\bar{|a_c|}}{\max_c(\bar{|a_c|}) + \varepsilon}$$
Ham mutlak ortalama aktivasyon, [0,1] aralığına normalize edilmiş hali.

**`combined`**
$$s_c = 0{,}6 \cdot \widetilde{|a_c|} + 0{,}4 \cdot \text{freq}_c$$
Normalize ortalama aktivasyon ile aktivasyon frekansının ağırlıklı toplamı; hem büyüklüğü hem de aktivasyon sıklığını dengeleyen hibrit metrik.

Son adımda her grubun kanallarına ait skorlar $[0, 1]$ aralığına yeniden normalize edilir. Düşük skora sahip kanallar `torch-pruning` tarafından öncelikli olarak budanır.

> **Geri dönüş mekanizması:** Katman hook'lar aracılığıyla yakalanamamışsa — örneğin model mimarisi desteklenmiyor ise — sistem, magnitude (L2 ağırlık normu) tabanlı geri dönüş skorunu otomatik olarak kullanır ve kullanıcıya uyarı mesajı iletir.

---

## 3. Diğer Kriterlerden Farkı

### 3.1. Ağırlık Tabanlı Kriterlerle Karşılaştırma (Magnitude L1/L2)

Magnitude kriterleri, kanal önemini doğrudan model ağırlıklarının normundan hesaplar:
$$s_c^{\text{mag}} = \|\mathbf{w}_c\|_p$$

Bu yaklaşım hiçbir veri gerektirmez; ancak **ağırlığı küçük bir nöronun veri üzerinde yine de kritik rol oynayabileceğini** göz ardı eder. Normalizasyon veya özel başlangıç koşulları bu durumu sıkça üretmektedir. Neuron Coverage, bu kör noktayı gidermek için ağırlıkları değil, **gerçek aktivasyon davranışını** temel alır.

### 3.2. Gradyan Tabanlı Kriterle Karşılaştırma (Taylor)

Taylor kriteri, kayıp fonksiyonunun ağırlıklara göre birinci dereceden Taylor açılımından türetilir:
$$s_c^{\text{taylor}} \approx \left|\nabla_{\mathbf{w}_c} \mathcal{L} \cdot \mathbf{w}_c\right|$$

Bu kriter hem ileri hem de **geri geçiş (backward pass)** gerektirdiğinden hesaplama maliyeti yüksektir ve etiketli kalibrasyon verisi zorunludur. Neuron Coverage ise **yalnızca ileri geçiş** kullanır ve etiket bilgisi gerektirmez; bu durum onu etiket bulunmayan, yalnızca girdi verisinin mevcut olduğu senaryolara uygun kılar.

### 3.3. WANDA ile Karşılaştırma

WANDA (Weight × Activation Norm), ağırlıklar ile aktivasyonların çarpımına dayalı bir önem kriteri uygular:
$$s_c^{\text{wanda}} = \|\mathbf{w}_c\| \cdot \|\mathbf{a}_c\|$$

Her iki bileşeni de birleştirmesi teorik açıdan WANDA'yı güçlü kılmaktadır. Neuron Coverage ise ağırlıkları tamamen devre dışı bırakarak karar sürecini **yalnızca aktivasyon örüntülerine** dayandırır. Başka bir deyişle Neuron Coverage, modelin girdiye verdiği tepkinin örüntüsünü (aktivasyon frekansı ve büyüklüğünü) bağımsız bir sinyal olarak değerlendirirken WANDA bu iki sinyali çarpar. Bu ayrım, özellikle ağırlıklarının normu yüksek olmakla birlikte çoğu girdide seyrek aktive olan kanalların tespitinde Neuron Coverage'ı avantajlı konuma getirir.

### 3.4. Diğer Kriterler (LAMP, FPGM, BN Scale, Random)

- **LAMP** — Global kayıp ağırlıklarına dayalı adaptif magnitude; yine ağırlık güncellemesi gerektirir.
- **FPGM** — Geometrik medyana uzaklık hesabına dayalı; ağırlık geometrisini esas alır, aktivasyon bilgisi kullanmaz.
- **BN Scale** — Batch Normalization γ (scale) parametresini önem skoru olarak kullanır; yalnızca BN içeren modellere özgüdür.
- **Random** — Rastgele budama; kontrol (baseline) deneyleri için referans olarak kullanılır.

Bu kriterlerden hiçbiri, kanalın gerçek veri üzerindeki **aktivasyon sıklığını** ve **kapsama genişliğini** doğrudan ölçmemektedir. Neuron Coverage bu boşluğu doldurmaktadır.

---

## 4. Karşılaştırma Özeti

| Kriter              | Temel Sinyal                        | Backward Pass? | Etiket Gerekli? | "Ölü Nöron" Tespiti |
| ------------------- | ----------------------------------- | -------------- | --------------- | ------------------- |
| Magnitude L1/L2     | Ağırlık normu                       | Hayır          | Hayır           | Dolaylı             |
| Taylor              | Gradyan × ağırlık                   | **Evet**       | **Evet**        | Dolaylı             |
| WANDA               | Ağırlık × aktivasyon normu          | Hayır          | Hayır           | Kısmen              |
| Activation          | Ham aktivasyon ortalaması           | Hayır          | Hayır           | Kısmen              |
| LAMP                | Adaptif magnitude                   | Hayır          | Hayır           | Hayır               |
| FPGM                | Geometrik medyana uzaklık           | Hayır          | Hayır           | Hayır               |
| BN Scale            | BN γ parametresi                    | Hayır          | Hayır           | Hayır               |
| **Neuron Coverage** | **Aktivasyon frekansı + büyüklüğü** | **Hayır**      | **Hayır**       | **Doğrudan**        |

---

## 5. Kullanım Senaryoları

Neuron Coverage kriteri özellikle şu durumlarda tercih edilmelidir:

- **Etiket bulunmayan** üretim verisi üzerinde budama yapılmak istendiğinde.
- Modelin ağırlıklarının belirli mimariler (başlangıç koşulları, normalize katmanlar) nedeniyle büyüklük sıralamasını bozduğu, bu yüzden magnitude temelli kriterlerin yanıltıcı sonuç ürettiği şüphesi taşındığında.
- Modelde **ölü nöron** varlığından şüphelenildiğinde; platform budama öncesinde katman bazında sıfır kapsama sayacını raporladığı için bu hipotez doğrudan test edilebilir.
- Taylor gibi gradyan tabanlı kriterlerin hesaplama maliyetinin kabul edilemez olduğu, ancak salt magnitude'nin yetersiz kaldığı durumlarda aktivasyon bilgisini gradyansız biçimde dahil etmek için.

---

## 6. Sınırlılıklar

- Kriter, kalibrasyon verisinin modele verilecek gerçek dağılımı temsil ettiği varsayımına dayanır. Dağılım kayması (distribution shift) durumunda kapsama puanları yanıltıcı olabilir.
- İleri geçiş sayısı (kalibrasyon örnekleri) arttıkça hesaplama süresi lineer olarak uzar; ancak gradient hesaplamaksızın bu maliyet Taylor kriterinden önemli ölçüde düşük kalır.
- Hook mekanizması desteklenmeyen özel katman türlerinde magnitude geri dönüşü devreye girer; bu durum kullanıcıya uyarı olarak bildirilir.
