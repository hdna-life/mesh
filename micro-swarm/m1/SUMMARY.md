# M1 — Jev Decision Mesh: gerçek sonuç

**4 Kasım 2026 — Son bounded reconciliation çıktısı: 41/41 kabul kontrolü geçti.**

Bu tek-geçiş başarısı değildir. İlk dondurulmuş M1 tek-geçişi başarısız oldu ve değiştirilmeden korunuyor. Daha sonra ayrıca dondurulan, aynı compiler/testlerle en fazla iki typed Jev düzeltmesi yapmasına izin verilen M1-r1 bir yeni kararla başarılı backend üretti. İki faz ayrı kaydedilmiştir.

| Faz | Semantik karar | Kalan çelişki | IR/compile | Backend | Kabul | API cost |
|---|---:|---:|---|---|---|---:|
| M1 ilk tek-geçiş | 124 | 1 | Reddedildi | Başlamadı | Erişilmedi | $0.001285032 |
| M1-r1 ayrı bounded uzlaştırma | +1 | 0 | Geçti | Başladı | 41/41 | $0.000088536 |
| API smoke | 2 bağlantı sorusu (semantik toplama dahil değil) | — | — | — | HTTP 200 | $0.000015792 |

## İstenen ölçümler

- **Jev semantik kararları:** 125 toplam; 124 aktif çözülmüş node, 1 superseded eski karar. API smoke soruları hariç.
- **Typed-valid cevap:** 125/125. Bu, bütün ilk kararların semantik olarak doğru olduğu anlamına gelmez; ilk uniqueness kararı hatalı/tutarsızdı.
- **Çelişkiler:** 1 gözlendi, ayrı fazda Jev ile çözüldü, 0 kaldı.
- **IR tamamlandı mı:** İlk fazda hayır; M1-r1 sonunda evet.
- **Compiler geçerli app üretti mi:** Son fazda evet. İlk sonucu geçerli saymak için checker gevşetilmedi.
- **Backend başladı mı:** Evet, gerçek macOS sandbox sürecinde HTTP istekleri aldı.
- **Kabul kontrolleri:** 41/41; input shape/type/boundary, JSON hata davranışı, idempotent replay, rollback, cancellation-once, son stok yarışı, concurrent idempotency, SQLite integrity/FK, gerçek DB/API eşleşmesi ve restart sonrası kalıcılık.
- **API:** smoke dahil 11 request; 33080 input ve 7148 output token; **$0.00138936** gerçek bildirilen maliyet. Tavan $0.05; reservation ödemeyle aynı sayı değildir.
- **Süre:** toplam API latency 9.939s; main + reconciliation ölçülen yürütme 8.814s. Smoke ayrı 2.385s. Geliştirme/dondurma aralarındaki insan/agent çalışma süresi bu latency hesabına dahil değildir.
- **Gerçek model sürümü:** typesafe/jev-1.14-20261014. Parametre sayısı veya fiziksel uzman ayrılığı doğrulanmış değildir.

## Çelişki ve sorumluluk

İlk Constraint kararı reservations.request_key unique=false (noul p(true)=0.12), Transaction kararı ise aynı alanı idempotency key seçti (choice p=1). Bu semantik/cross-decision tutarsızlığı Jev kararlarından geldi; graph/compiler bunu gizlemeden reddetti. İlk max_reconsiderations=0 politikası nedeniyle backend oluşmadı. Bu ilk negatif sonuç RESULTS.json ve ilk run altında korunur.

M1-r1 generic policy yalnızca compiler'ın mevcut invariant'ını inceler: seçilen idempotency key unique olmalıdır. Jev orijinal gereksinim ve çelişen kararlarla `enforce_unique`, `drop_replay` veya `unresolved` seçer. Tek seçimde enforce_unique p=0.96, confidence=0.94 geldi. Value engine tarafından tahmin edilmedi; yeni typed karara göre IR alanı güncellendi, önceki node superseded olarak korundu. Compiler ve kabul testlerinin hash'i değişmedi. Yeni helper entity adı veya inventory branch'i içermiyor.

Bu son düzeltme, compiler invariant'ından mantıksal olarak da türetilebilirdi. Burada Jev'e açıkça seçtirildi; bunu yeni bir derin semantik keşif olarak sunmuyoruz. Sonraki başarı gerçek backend test başarısıdır, fakat ilk 124 kararın hepsinin tek başına doğru olduğu iddiası değildir.

## Compiler ne sağladı, Jev ne sağladı?

Jev entity dahil etme, field type/required/identity, relation, constraint profile/unique, operation kind/target/value bindings/state, numeric effect/guard/atomicity/idempotency, HTTP method/status/input-output map ve hata status'larını seçti. Giriş adları insanın açık requirement sözlüğünden; açık uçlu isim veya problem ayrıştırma keşfi değil.

Deneyden önce Codex tarafından yazılmış generic compiler/runtime SQL DDL/parametreli query, validation, identity allocation, IF NOT EXISTS migration, BEGIN IMMEDIATE, idempotent row replay/comparison, state transition/effect yürütmesi, Flask route/server ve persistence mekaniklerini sağladı. Bu algoritmalar Jev tarafından yazılmadı. Runtime/compiler'da products/reservations/stock veya endpoint özel branch yoktur. Adapter'ın kapalı, insan tasarımı grammar'ı göreve verilecek semantik seçenekleri sınırlar. Bu grammar ve mekanik katkı başarının önemli bir parçasıdır.

## Aynı compiler Jev olmadan ne yaptı?

- **Human-complete IR:** Jev olmadan aynı compiler ile 41/41 geçti. Bu test kontrolüdür, model başarısı değildir; gerçek production path bu IR dosyasını okumaz.
- **Empty/incomplete graph:** çözüm uydurulmadan reddedilir.
- **First-choice policy:** aynı candidate space'te Jev olmadan ilk seçenekler alındı; geçerli IR üretemedi. Bu zayıf bir negatif kontroldür, bütün deterministik politikalarla veya iyi rule-based semantic parser ile karşılaştırma değildir.

Dolayısıyla sonuç "compiler kendiliğinden çözemiyor" veya "Jev zorunludur" kanıtı değildir. Doğru IR verildiğinde compiler'ın çalıştığı, bu görevde Jev + bounded graph uzlaştırmasının da o IR'ye ulaşıp gerçek testleri geçirdiği gösterildi.

## Sınırlar

Bir görev, bir structured decision model, sınırlı ve insan tasarımı operasyon dili. Candidate entity/field/path/body adları açık contract'tan geliyor; golden code'dan alınmadı. Generic/novel software engineering, geniş unseen benchmark başarısı, sub-billion model boyutu, ayrı fine-tune uzmanlar veya merkeziyetsiz fiziksel ağ iddiası yok. Compiler henüz keyfi davranışı desteklemez; unsupported semantics reddedilir. Başarı mekaniklerinin önemli kısmı önceden yazılmış compiler/runtime'dadır.

15 ana unit testi + 1 compiler control integration testi (41 acceptance check) + 4 reconciliation policy testi geçti. Reconciliation ayrı protokolle, kendi kaynak/tests/config hash'leriyle donduruldu; ilk M1'de sonuca göre değişiklik yapılmadı. Compiler'a örneğe özel rule, source patch veya golden çözüm eklenmedi. M0/M0.1/M0.2 kaynak/sonuç/arşiv hash'leri korunur.

## Çıktılar

- `artifacts/application/app.py`: gerçekten test edilen dosyanın aynı byte kopyası.
- `artifacts/application/ir.json`, `verification.json`: uygulamanın typed IR'si ve 41 kabul sonucu.
- `artifacts/decision-graph.json`: ilk hata + superseded karar + Jev uzlaştırması.
- `runs/provider.jsonl`: bütün ham typed request/answer, probabilities, revision, latency, usage/cost. Authorization veya secret yok.
- `results/M1-evidence.zip`: kaynak, frozen protokoller, tüm negatif/pozitif fazlar ve kanıtlar.

**Sonuç:** Bu sınırlı görevde dar typed kararlar + açık graph uzlaştırması + generic compilation, generatif kod modeli kullanmadan fonksiyonel backend üretti. Bu olumlu bir fizibilite sinyalidir; genel araştırma tezinin kesin kanıtı değildir.

### Altyapı yazarlığı açıklaması

Frozen protokollerdeki “insan yazımı / human-complete” ifadesi model worker tarafından üretilmeyen, önceden tanımlı altyapı ve kontrol IR anlamındadır. Compiler, adapter ve kontrol IR Codex tarafından açık görev şartlarından geliştirilmiştir. Deneyin çalıştırılan worker pipeline’ında generatif coding LLM yoktur; altyapı geliştirmede hiç generatif kodlama aracı kullanılmadığı iddia edilmez.
