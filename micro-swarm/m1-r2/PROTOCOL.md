# M1-r2 — Jev-Orchestrated 1B Experts

Tek pilot. M0–M1 kaynak/sonuç/kanıtları hash ile korunur. Yeni workspace dışında compiler, Typed IR ve mevcut 41 acceptance kontrolü değiştirilmez. Golden/control IR worker veya router'a verilmez. Kaynak soru grameri ve açık gereksinim/symbol dictionary M1'den yeniden kullanılır.

## Ayrım

- Cloudflare `@cf/meta/llama-3.2-1b-instruct`: Entity, Field, Relationship, Constraint, Operation, Transaction, HTTP rollerinin BÜTÜN semantik seçimleri. Her inference tek enum/noul sorusudur. Kod üretimi istenmez.
- OpenRouter `typesafe/jev-1.14`: yalnızca ready role seçimi ve iki sorumlu rol arasından conflict repair routing. Payload role/status/question count/completion/error-code metadata'sıdır. Requirements, semantic question/criteria, IR entity/field values veya uzman cevapları Jev'e verilmez. Jev cevabı IR değerine dönüştürülmez.
- Aynı M1 compiler ve aynı M0.2 verifier/41 kontrol. Eksik seçim hiçbir golden değer veya Jev cevabıyla tamamlanmaz.

## Gerçek routing alternatifleri

Entity ve Field public aday dictionary üzerinden bağımsız başlatılabilir. Field bütün adaylar için ön-hesap yapar; Entity sonradan dışlarsa bu adayın karar maliyeti yine kayıttadır. Sonra Relationship, Constraint, Operation başlangıç görevleri bağımsız ready olabilir. Bu iki grup Promise tabanlı scheduler'a birlikte sunulur. Diğer bağımlı aşamalar aynı M1 dönüşümünü kullanır. Bağımsız gruplar tamamlanmadan sonraki binding aşaması açılmaz; pilot tam paralel speculative semantic planning iddiası değildir.

Birden fazla gerçek role ready ise Jev seçer. Tek yasal role ready ise deterministik seçim yapılır; bu Jev orkestrasyon kararı sayılmaz. Her seçimde alternatif listesi, deterministik priority baseline seçimi ve farklılık kaydedilir. Priority: Entity, Field, Relationship, Constraint, Operation, Transaction, HTTP. Counterfactual semantic inference tekrarlanmaz; routing farkı performans kazanımı kanıtı değildir.

## Enum ve bounded repair

Worker cevabı yalnızca exact key, tek JSON string/boolean veya tek text/json fenced key olabilir; tek inline backtick ve benzersiz case-insensitive eşleştirme kabul edilir. Prose, liste, başka key veya eksik cevap reddedilir. Alanı sessiz doldurma, cevap çıkarımı, gen-code temizleme yoktur. unsupported geçerli biçim ama çözülemeyen semantiktir; başarılı karar sayılmaz.

TOPLAM en fazla iki repair (format + unsupported + IR conflict ortak bütçe). Format/unsupported için yalnızca aynı artifact/karar sahibi yetkilidir: zorunlu hedef deterministik kaydedilir, sahte Jev seçimi yapılmaz. Cross-role idempotency/uniqueness tutarsızlığında Jev yalnızca Constraint veya Transaction rolünü seçer. Sonra seçilen rolün orijinal sorusunu aynı 1B model yanıtlar. Jev'e çelişen değerler verilmez; compiler diagnostic worker'a gider. Başka semantik conflict otomatik uydurulmaz; başarısızlık kaydedilir.

## Bütçe

OpenRouter toplam en fazla $0.05 ve 12 coordinator request; mevcut fiyat snapshot'ı/UTF-8 conservative reservation kullanan aynı M1 provider, ayrı M1-r2 ledger'ı. Unknown cost veya cap aşımında yeni çağrı yok. Cloudflare Workers Free yerel doğrulaması zorunlu; aynı ortak UTC günlük ledger, 5000 Neuron rezervasyon tavanı. Önceki tüketim silinmez. Worker global en fazla 160 çağrı, her cevap 32 token, seed42, temperature0. Mevcut Cloudflare client per-role limit120; ayrı global160 sınırı bunun üzerinde aggregate cap'tir, günlük ledger ortaktır. Ücretli moda geçilmez. Token-price equivalent CF gerçek fatura değildir.

## Dondurma ve karar

Adaptör unit testleri yalnızca parser/routing isolation/ready alternatiflerini doğrular; yeni uygulama kabul testi yoktur. Main kod, config, protocol ve reused tüm önceki kaynak/çıktılar first real run öncesinde hash'lenir. Tek gerçek run, max2 repair; başarısızlık sonrası ikinci sürüm veya seçilmiş başarılı rerun yapılmaz. IR oluşursa aynı compiler, aynı HTTP/SQLite/concurrency/restart suite. Giriş önkoşulu başarısızsa erişilemeyen kontroller geçti sayılmaz.

Semantic karar attempt sayısı, benzersiz resolved karar, unsupported/invalid/missing istek, blocked future role, conflict ve routing ayrı sayılır. Typed-valid doğru semantik kanıtı değildir. Sadece 41/41 tam kabul başarısıdır. Sonuç ne olursa olsun ham routing/worker request/cevap ve tüm failure/IR/graph/test kayıtları korunur. API anahtarları yalnızca yerel env, log/commit dışında.
