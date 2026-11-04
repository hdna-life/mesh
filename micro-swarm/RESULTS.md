# M0 — Can Small Models Cooperate?

**Tarih:** 4 Kasım 2026 (Europe/Istanbul).  
**Durum:** İlk gerçek development deneyi tamamlandı — **negatif sonuç**.  
**Araştırma kararı:** **Tez kanıtlanmadı. İş birliği avantajı gösterilemedi. K1/K2 değerlendirilmedi.**

## Görev ve ön kayıt

Python + Flask + SQLite ile stok ve rezervasyon REST API’si. Ürün/rezervasyon tabloları, foreign key, atomik stok düşümü, eşzamanlı son stok yarışı, idempotent anahtar, iptalde bir kez stok iadesi ve restart sonrası kalıcılık gerekliydi. Kullanıcı Task API başlangıcını bu görevle değiştirdi; Docker kullanımını disk kısıtı nedeniyle kaldırdı.

Model: `@cf/meta/llama-3.2-1b-instruct`. Aynı ağırlıklar, seed=42, temperature=0. A/A2/B/C aynı sözleşme ve aynı toplam bütçe tavanıyla çalıştırıldı. Protokol ve testler gerçek sonuçlardan önce donduruldu; sonrasında değiştirilmedi. Önceki iki development snapshot’ı da docs içinde korunuyor.

## Gerçek gözlemler

| Kol | Model çağrısı | Input token | Output token | Uçtan uca sn | API’nin bildirdiği Neuron | Tam görev başarısı | Hatalar |
|---|---:|---:|---:|---:|---:|---:|---|
| A | 1 | 710 | 1,300 | 7.36 | 25.47 | 0 | `parse_error` |
| A2 | 4 | 2,873 | 4,052 | 24.83 | 81.02 | 0 | `parse_error` |
| B | 4 | 3,135 | 3,330 | 24.18 | 68.48 | 0 | `parse_error`, `runtime_error` |
| C | 3 | 2,187 | 2,932 | 17.37 | 58.89 | 0 | `parse_error` |

Toplam **12 görev inference çağrısı**, **8,905 input** ve **11,614 output token**; API tarafından bildirilen toplam **233.86 Neuron**. Öncesinde ayrıca 8-output-token limitli bir provider bağlantı çağrısı yapıldı, HTTP 200 / `OK` alındı. Bu bağlantı kontrolü görev başarısı değildir.

**12/12 görev cevabı strict JSON parse aşamasında başarısız oldu.** Model JSON dosya protokolü yerine açıklama + Markdown kod blokları döndürdü. C, schema adımında üç çağrıdan sonra durdu; API/validation/entegrasyon aşamasına erişemedi. A2 de format hatası geri beslemesiyle dört çağrı yaptı, kabul edilebilir çıktı üretemedi.

B sabit sırası nedeniyle diğer rolleri çağırmaya devam etti. Test runner iki tanı üretti: uygulama başlatılamadı (`app.py` yok) ve SQLite dosyası yoktu. Bunlar gerçek üretilmiş bir backend’in HTTP/atomiklik testlerinde başarısız olması şeklinde yorumlanamaz: parse edilebilir dosya çıktısı hiç oluşmadı. Hiçbir gerçek kol için çalışan model uygulaması elde edilmedi.

Ham cevaplarda, izin verilmemesine rağmen `flask_sqlalchemy` kullanımı da görüldü. Bu bir metin incelemesi bulgusudur; söz konusu kodlar elle çıkarılmadı, düzeltilmedi veya çalıştırılmadı. Runtime doğruluğu hakkında ek sonuç çıkarmıyoruz.

## Yorum ve karar

- Bu konfigürasyonda **M0 görev başarısı 0/4 kol koşumu**. Bu oran bir development görevindeki gözlemdir; 20 görev başarı oranı değildir.
- İlk darboğaz çıktı protokolü. Koordinasyonun API, transaction veya eşzamanlılık doğruluğuna katkısı ölçülemedi.
- C/A oranı 0/0 olduğu için tanımsızdır. “İki kat kazanç” ya da “ağ daha zeki” iddiası yapılamaz.
- Bu sonuç geniş araştırma tezini çürütmez. Aynı zamanda onu destekleyen olumlu kanıt da değildir.
- C’nin format yeniden denemeleri aynı istemi tekrarlar; format hatasını düzelten ayrı bir uzman veya constrained decoder yoktur. Bu, test edilen sürümün sınırıdır.
- Dört toplam sürenin 120 saniyeden kısa olması, başarıyla biten iş için p95 hedefinin sağlandığı anlamına gelmez. Başarı yok; tek görevden güvenilir p95 dağılımı da çıkarılamaz.
- Sonuçları gördükten sonra parser gevşetilmedi, Markdown’dan dosya çıkarılmadı, prompt/test değiştirilmedi, güçlü modele geçilmedi.

**20 gerçek holdout koşumu kullanıcı kararıyla yapılmadı.** K1/K2 için veri yok. Model kotası tüketmeyen mock holdout kontrolü de aynı istekle durduruldu: 33 tamamlanmış altyapı koşumu ve 1 açıkça işaretlenmiş yarım koşum korunuyor. Bunlar model başarısı sayılmaz.

## Doğrulanan altyapı

- 9 core test geçti: strict parser, dosya/path/symlink kısıtları, graph/cycle/dependency/bütçe kontrolü ve ledger.
- 5 runner kalibrasyonu geçti: doğru altın referans tüm kabul testlerini geçti; dört kasıtlı bozuk uygulama reddedildi (stok düşümü, iki kez iptal iadesi, restart veri kaybı, boolean miktar).
- Mock A/A2/B/C smoke akışı geçti. Bu elle yazılmış referansla test düzeneğinin çalıştığını gösterir; model başarısını göstermez.
- macOS Seatbelt dosya okuma/yazma ve ağ kısıtları her çalıştırmada kontrol edilir. Docker container çalıştırılmadı. Başlatılmış image build kullanıcı disk kısıtını belirttiğinde iptal edildi. İzolasyon sınırları LIMITATIONS.md içinde açık.
- Ücretsiz Workers hesabı kullanıcının beyanına göre doğrulandı; paid moda geçilmedi. Yerel günlük ledger 597.44 Neuron **üst sınır rezervasyonu** tuttu; bu, gerçek API tüketimiyle aynı sayı değildir.

## Kayıtlar

- **A**: [ham trace](runs/1793749080808-dev-inventory-A-e5f0e47e/trace.jsonl), [özet](runs/1793749080808-dev-inventory-A-e5f0e47e/summary.json), [başlangıç istemi](runs/1793749080808-dev-inventory-A-e5f0e47e/initial.json).
- **A2**: [ham trace](runs/1793749088170-dev-inventory-A2-3e15d8e7/trace.jsonl), [özet](runs/1793749088170-dev-inventory-A2-3e15d8e7/summary.json), [başlangıç istemi](runs/1793749088170-dev-inventory-A2-3e15d8e7/initial.json).
- **B**: [ham trace](runs/1793749113002-dev-inventory-B-f355551f/trace.jsonl), [özet](runs/1793749113002-dev-inventory-B-f355551f/summary.json), [başlangıç istemi](runs/1793749113002-dev-inventory-B-f355551f/initial.json).
- **C**: [ham trace](runs/1793749137190-dev-inventory-C-01dff5c9/trace.jsonl), [özet](runs/1793749137190-dev-inventory-C-01dff5c9/summary.json), [başlangıç istemi](runs/1793749137190-dev-inventory-C-01dff5c9/initial.json).

Tüm prompt/cevap ve başarısızlık kayıtları runs içinde saklanır. runs ve .env gitignored’dır; sonuçların yerel kopyası korunur. results/M0-evidence.json küçük, secretsız ölçüm özeti ve kanıt dosyalarının hash’lerini içerir. Ham M0 kayıtlarının ayrıca results/M0-raw-evidence.zip arşivi ve SHA-256 kaydı korunur; raporda başarı uyduran sentetik veri yoktur.

## Sonraki deney için koşul

Yeni deney otomatik başlatılmadı. Önce bağımsız, çok küçük bir **protokole uyum ölçümü** tasarlanabilir: aynı 1B model, plain strict JSON istemi ile sağlayıcı destekliyorsa constrained JSON output karşılaştırması. Bu M0’ı geriye dönük başarılı yapmaz. Yeni sürüm/ön kayıt, yeni bütçe ve bütün kollara aynı format desteği gerekir. Format aşaması aşılmadan 20 holdout veya geniş ağ iddiasına geçmek için kanıt yoktur.
