# MICRO-SWARM — Research Brief & Codex Implementation Specification

**Tarih:** 4 Kasım 2026  
**Durum:** Araştırma hipotezi / uygulama öncesi. Henüz çalışan bir MVP veya doğrulanmış performans sonucu yok.  
**Dil:** Türkçe. Teknik terimler ve kod İngilizce olabilir.  
**Amaç:** Codex'in bu metni kullanarak olabildiğince küçük, ölçülebilir ve düşük maliyetli bir deney ortamı kurması.

---

## 0. Tek cümlelik tez

Genel amaçlı bir büyük LLM veya merkezi muhakeme modeli olmadan, **çok küçük ve dar görevlerde çalışan dil modelleri**, deterministik bir **Decision Engine**, paylaşılan görev durumu, uzmanlık/bağımlılık grafiği, doğrulama ve hata onarma döngüsüyle **tek bir küçük modelin tek seferde yapamadığı gerçek yazılım geliştirme işlerini** tamamlayabilir mi?

İlk deneyin hedefi **özellikle bu hipotezi test etmek**, güzel bir ürün üretmek değildir. Çalışan ama kötü/çirkin kod dahi kıymetli bir sinyaldir. Başarısız sonuçlar da muhafaza edilmelidir.

## 1. Projenin vizyonu ve kapsam ayrımı

### 1.1 Uzun vadeli vizyon (İLK MVP'DE YAPILMAYACAK)

- Hedef uzman model kapasitesi: **yaklaşık 265 milyon parametre**; mümkün olduğunca tek ve çok dar bir beceride uzmanlaşmış modeller.
- Topluluk üyeleri sürekli yeni uzmanlar yayımlar; zaman içinde büyüyen **public expert registry**.
- Uzman modeli ayrı tam model veya ortak bir temel modele bağlı adaptör (LoRA vb.) olarak yayımlanabilir. Ortak base + adaptör, bellek bakımından avantajlı olabilir; bunun 265M seviyesinde doğruluğu henüz kanıtlanmış değil.
- İstemciler gönüllü olarak **Chrome extension adapter** kurar. Uzmanlar **WebGPU** üzerinde yerel inference yapar.
- İstemciler **WSS** üzerinden dışarıya doğru bağlantı açarak ağdaki işleri alır; merkezi katman inference yapmak zorunda değildir.
- Uzmanlık seçimi ve worker/canlı cihaz seçimi ayrı kararlardır. `ExpertScore` kaliteyi; `WorkerScore` latency/availability/capacity'yi; gerekirse `WorkerExpertScore` kombinasyonu takip eder.
- Worker durumları: `HOT` (GPU belleğinde yüklenmiş ve hazır), `WARM` (lokal cache), `COLD` (indirilmesi gerekir), `BUSY`, `OFFLINE`.
- Rastgele zamanlarda gizli **canary challenges**, uygun mahremiyet önlemleriyle **shadow tests**, sınırlı **stress tests** ve düzenli benchmark ile düğümler değerlendirilir.
- Model ağırlıklarının gerçekten iddia edilen sürümde çalıştırıldığı, sadece model hash beyanı veya test cevabından **kriptografik olarak kanıtlanamaz**. Güven edilmeyen worker varsayımıyla tasarım yapılmalı.
- Extension MV3 lifecycle, WebGPU host sayfası/offscreen belge, Chrome Store politikaları, kullanıcıdan açık opt-in, GPU güç/bellek limiti ve veri gizliliği sonradan araştırılacak.
- Uzun vadede sistem yeni bir beceri açığı gördüğünde topluluktan yeni bir uzman eğitilmesini isteyebilir. Bu bir konsepttir, kanıtlanmış mekanizma değildir.

### 1.2 Bu MVP'nin kapsamı (ŞİMDİ YAPILACAK)

- **Tek küçük hosted model**, birden fazla mantıksal uzman rolüyle çağrılacak. Ayrı model ağırlıkları, ayrı fine-tune veya yerelde dört LLM çalıştırılması gerekmiyor.
- Hosting: kullanıcının mevcut **Cloudflare** hesabında **Workers AI**.
- İlk model: `@cf/meta/llama-3.2-1b-instruct` (1B, 265M DEĞİL).
- **Merkezi LLM planner olmayacak.** Ayrıştırmayı ve yönlendirmeyi TypeScript ile yazılmış deterministik bir motor yapacak.
- Gerçek bir küçük backend üretilecek, otomatik HTTP ve veri kalıcılığı testleriyle doğrulanacak.
- **Aynı modele aynı hesaplama bütçesiyle tek parça çözüm ürettirme baseline'ı** oluşturulacak.
- Başlangıç aşamasında dört mantıksal rol aynı model endpoint'ine gider; `Schema`, `API`, `Validation`, `Repair`.
- Basit ve ölçülebilir gözlemlenebilirlik (JSONL log, token ve latency, test sonucu, tüm promptlar, model sürümü).
- Deney hızlı ve düşük maliyetli olmalı. Public marketplace, Chrome extension, WSS relay, kullanıcı hesabı, dashboard, DB, ödeme sistemi, uzman eğitimi ve multi-machine orkestrasyon **yapılmayacak**.

## 2. Konuşmada netleşen araştırma soruları

1. **Deterministik ayrıştırma:** LLM olmadan bir görevi uygun uzmanlık işlemlerine bölebilir miyiz? Bilinen ve kural tanımlı alanlarda HTN, precondition/effect, backward chaining ve capability graph ile evet; tüm açık uçlu görevlerde garanti yok.
2. **1B planner gerçekten gerekli mi?** Kullanıcı 1B planner fikrini bilinçli biçimde sınamak için gündeme getirdi. Tercih edilen tasarımda **1B planlayıcı YOK**. Bu kapasite bütçesini seçici/planlayıcı bir genel LLM'ye yatırmak yerine deterministik kontrol ve gerektiğinde küçük uzmanların yerel kararları kullanılacak.
3. **Uzmanlık ne kadar atomik olabilir?** Çok dar uzman eğitimi tek başına başarının kanıtı değil. Uzman sayısı arttıkça bağlam taşıma, entegrasyon ve hata birikimi artabilir. Amaç “en küçük uzman” değil, **uçtan uca başarı/maliyet açısından en küçük kullanışlı uzmanlık birimi**ni bulmak.
4. **Yeni görev keşfi:** Yazılım işlerinin çoğu bilinen alt görevlerin yeni kombinasyonlarıdır. Önceden tanımlı `requires`/`produces` bağımlılıkları ve uzmanların kendi alanlarında `proposed_tasks` üretebilmesiyle plan, yürütme sırasında genişleyebilir. Ancak hiçbir uzmanın fark etmediği gereksinim yine kaybolabilir.
5. **Yeni bakış açısı?** MoE, multi-agent, planner, browser GPU ve küçük modeller ayrı ayrı yeni değil. Özgünlüğü test edilecek kombinasyon: **sub-300M topluluk uzmanları + LLM'siz deterministik koordinasyon + dağıtık WebGPU runtime + doğrulanabilir uçtan uca yazılım üretimi**. Öncelik yeni olduğu iddiası değil, deneysel kanıttır.
6. **Sistem gerçekten 'zeki' oluyor mu?** Çalışan kolektif problem çözme, büyük LLM'nin tüm genel muhakemesine eşdeğer değildir. Başarı iddiası görev alanı ve benchmark ile sınırlıdır.

## 3. Temel mimari ilkeleri

- **Model = dar fonksiyon**, mümkünse yapılandırılmış JSON çıktılı ve bounded görevli. Tam sohbet asistanı olmasına gerek yok.
- **Decision Engine = deterministik orchestration**. LLM değil; graph state, ön koşullar, eylemler, seçim, zaman aşımı, onarım, geri alma yönetir.
- **Semantic understanding ≠ expert selection ≠ task decomposition**. İlk deneye genel anlama problemini gizlice çözmüş bir şablon yerleştirme. Başlangıçta sınırlı alanlı capability graph ile test yap; kısıtları açık bildir.
- **Ortak görev durumu:** JSON ile amaç, kısıtlar, kararlar, üretilen dosyalar, doğrulanmış/eksik beceriler ve yürütme geçmişi tutulur. Uzmanlar birbirine devasa konuşma dökümleri değil ihtiyaç duyulan minimum bağlamı verir.
- **Uzmanların sözleşmesi:** giriş şeması, çıkış şeması, `requires`, `produces`, ön/son koşullar, sınırlar, hata tipleri. Mümkün olduğunca uzman, `result`, `requirements`, `proposed_tasks` döner.
- **Deterministik doğrulama:** Code/test runner, JSON schema, migration, HTTP testleri. Yalnızca başka bir LLM'nin onay vermesi yeterli değildir.
- **Hata lokal onarımı:** başarısız adım en fazla 1–2 defa yeniden üretilir; sonsuz döngü ve görev patlaması yok. Her deneme kayıt edilir.
- **Yürütmenin kendisi deneyin bir parçasıdır:** çalışan HTTP API ve doğru veri kalıcılığı, güzel koddan daha önemlidir.
- **Adil baseline:** daha fazla çağrı/token veya sabit hazır kod şablonu dolayısıyla ortaya çıkan kazanım, 'kolektif zekâ' kanıtı diye sunulmaz.

## 4. İlk mikro deney — çalışma biçimi

### 4.1 Deney görevi

Görev: “Python ile SQLite kullanan basit bir görev yönetim REST API oluştur. Görev ekle, listele, tamamla, sil; hatalı girdileri reddet; veriyi kalıcı tut.”

Dar seçilen teknoloji: Python + Flask veya FastAPI (tek birini config'te sabitle), SQLite. **Bu ilk deneyde teknoloji seçme yeteneğini ayrıca kanıtlamıyoruz.** İkinci görev grubunda teknoloji seçiminin kendisi ayrı test olarak eklenecek.

Üretilecek uygulama en azından `POST /tasks`, `GET /tasks`, `PATCH /tasks/:id`, `DELETE /tasks/:id` işlemlerini yapmalı. Uç nokta sözleşmesi deney öncesinde sabitlenmeli ve tüm konfigürasyonlara **aynı** verilmeli; aksi halde farklı arayüz yorumları sonuçları bozabilir.

### 4.2 Üç deney kolu

- **A — Single-model baseline:** Aynı 1B modele tüm görevi doğrudan ver; dosyaları üretmesini iste; test et. Aynı giriş spesifikasyonu ve benzer toplam çıktı/inference bütçesi.
- **B — Fixed-sequence multi-role:** Aynı 1B model `Schema -> API -> Validation -> Repair` şeklinde önceden sabit sırada çağrılır; çıktı ve test koşulları aynı.
- **C — Dynamic graph decision engine:** Aynı dört rol capability graph, `requires` / `produces`, açık görev durumu, hata çıktısına dayalı yeniden planlama ile çağrılır. C'nin B'yi geçmesi Decision Engine'in ek katkısı için sinyaldir.

A vs B: iş bölümünün katkısı. B vs C: dinamik kontrolün katkısı. A vs C: bütün sistemin etkisi. **Hepsinin aynı model ağırlıklarına dayanması özellikle amaçlıdır.** Bu, 265M veya ayrı fine-tune uzmanların avantajını kanıtlamaz.

### 4.3 Uzman rolleri

1. `schema.expert`: Sadece SQLite CREATE TABLE ve gerekli DB erişim kararları; kendi çıktısını makinece doğrulanabilir biçimde sağlar.
2. `api.expert`: Yalnızca HTTP handler / route kodu; verilmiş schema ve endpoint contract'a uyar.
3. `validation.expert`: Girdi doğrulama, hata kodları, edge cases ve test koşullarının uygulama parçaları.
4. `repair.expert`: Sadece hata günlükleri ve ilgili dosyalar üzerinden küçük patch üretir. Tüm projeyi sıfırdan tekrar yazmaz.

İsteğe bağlı sonradan `requirements.discovery` eklenebilir; ilk dört rol ile deney kısıtlı tutulur. **Uzmanlar gerçekte fine-tune değil; aynı modelin farklı promptlarıdır.**

### 4.4 Çıktı protokolü

Her uzman makinece parse edilebilir JSON üretmeli. Örnek:

```json
{
  "result": {"files": [{"path": "app.py", "content": "..."}]},
  "requirements": ["database.schema"],
  "proposed_tasks": [],
  "assumptions": ["Python + SQLite is fixed for this experiment"]
}
```

JSON parse problemi ve schema violation ayrı failure olarak loglanmalı; ham model cevabı saklanmalı. Parser başarısızlığını gizlice insan eliyle düzeltme. JSON için sınırlı otomatik onarım yapılırsa o da bütçeye ve metriklere dahil edilmeli.

### 4.5 Capability manifest örneği

```json
{
  "id": "database.sqlite.schema",
  "role": "schema",
  "requires": ["spec.api_contract"],
  "produces": ["database.schema"],
  "input_schema": "schema-request-v1",
  "output_schema": "expert-response-v1"
}
```

`requires` ön koşulları eksikse görev seçilemez; engine ilgili üretici capability'yi graph'ta arar. Döngü algılama, task deduplication, max-depth, max-tasks ve timeout uygulanmalı. Üretilen görevler de yalnızca allowlisted capability ID'lerinden seçilebilmeli.

## 5. Çalıştırma mimarisi (ilk MVP)

```text
CLI / Test Runner
  -> Run Manager (seed, budget, logs)
  -> Decision Engine (TypeScript, NO LLM)
     -> Capability Registry (JSON)
     -> Task Graph + Shared State
     -> Expert Client
          -> Cloudflare Workers AI: Llama 3.2 1B Instruct
     -> Artifact Assembler (safe file paths)
     -> Isolated Executor + HTTP Test Runner
     -> Failure Feedback -> limited repair
  -> JSONL traces + summary report
```

**En hızlı uygulama:** Orkestratörü Node.js/TypeScript CLI olarak yerelde çalıştır, sadece inference'i Cloudflare'a gönder. Kullanıcı yerelde dört model çalıştırmak istemiyor; küçük bir CLI, JSON dosyaları ve üretilen Python uygulamasının izole testleri buna aykırı değil. İstenirse sonradan orkestratör de Worker'a taşınabilir; ilk etapta Workers'ı uzun süreli Python süreçlerini çalıştıran runtime olarak kullanma.

Cloudflare erişimi için iki seçenek:

- Mevcut Worker içinde AI binding (`env.AI.run`) ve hafif `/infer` endpoint'i; ya da
- Node CLI'dan doğrudan Cloudflare Workers AI REST API.

**Codex daha az kurulum gerektiren yolu seçsin.** Mevcut hesapta çalışma izni olmadan deployment yapmasın. Yerelde mock AI provider ile bütün sistemi test edebilsin; gerçek Cloudflare anahtarı env'den alınsın, repoya yazılmasın.

Model ID: `@cf/meta/llama-3.2-1b-instruct`.

Resmi kaynaklar:
- https://developers.cloudflare.com/workers-ai/models/llama-3.2-1b-instruct/
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/

4 Kasım 2026 itibarıyla dokümantasyonda bu model bulunuyor; Cloudflare günlük 10.000 ücretsiz Neuron sunuyor. Kota aşılınca çağrılar hata verebilir; ücretli plandaysa kota üstü kullanımı ücretli olabilir. **Deney kendi tüketim sınırını da koymalı**. Model erişimi ve hesap izni gerçek ilk çağrıda doğrulanmalı. `wrangler dev` ile yapılan AI çağrıları da uzaktaki modeli kullanıp kotayı tüketebilir.

## 6. Güvenlik ve izolasyon

- LLM'nin ürettiği kod, güvenilmeyen koddur. İzole temp klasör veya sandbox/container kullan; erişilebilir mevcut uygulama kaynaklarına, `.env`, SSH anahtarlarına, üretim DB'ye ve hassas host dosyalarına erişim verme.
- Üretilen dosyaların yalnızca allowlisted çalışma klasörü içine yazılmasına izin ver. Path traversal (`../`, absolute path, symlink) reddedilmeli.
- Testleri mümkünse CPU/bellek/zaman limitiyle ve **network kapalı** çalıştır. HTTP smoke testleri sadece loopback'e istek atsın. Hostun tam güvenlik izolasyonu sağlanamıyorsa bunun sınırını açıkça raporla.
- Çalışma sürecini ve child process'leri timeout'ta temizle; portları boşalt; sonuçları yanlışlıkla önceki run dosyalarıyla karıştırma.
- API anahtarları env secret olarak kullanılsın; hiçbir trace'e yazılmasın.
- Gerçek kullanıcı verisi yok; yalnızca sentetik test girdileri.

## 7. Ölçümler ve MVP eşikleri

### 7.1 İki ana başarı kriteri

**K1 — Uçtan uca çalışan iş:** İlk benchmark'taki **20 farklı görevden en az 4'ü** (>= %20) gizli otomatik kabul testlerini geçsin. Bu yalnızca iç MVP için keyfi başlangıç eşiğidir, akademik standart değildir.

**K2 — Koordinasyon kazancı:** Aynı model ve mümkün olduğunca eşit toplam inference bütçesinde, dinamik uzman ağı (C) tek model baseline'ından (A) **en az 2 kat yüksek başarı oranı** elde etsin. Örn. A=2/20, C=5/20. Başlangıçta sıfır başarı veya çok küçük örneklem varsa oran tek başına anlamlı olmayabilir; ham sayılar raporlanmalı.

Ek performans hedefi: basit görevler için **p95 uçtan uca bitiş süresi < 120 saniye**. Bu deneysel/ürünsel bir hedef; Cloudflare response time değişebilir. Sonuç bu sınırı tutturmazsa gerçek süreyi raporla; başarısızlığı gizleme.

**ÖNEMLİ:** 20 görev istatistiksel/genellenebilir akademik kanıt değildir. Pozitif sinyal gelirse 100+ farklı, görülmemiş göreve genişlet. İlk birkaç task elle demoya özel optimize edildiyse benchmark'a dahil etme; ayrı `development` / `holdout` kümeleri tut.

### 7.2 Zorunlu log alanları

- `run_id`, `scenario_id`, `arm` (A/B/C), `seed`, `timestamp`.
- `model_id`, generation params, prompt/system role, input/output token sayısı (API döndürdüğü ölçüde), ham çıktı.
- `expert_id`, `capability_id`, planned task graph snapshot, dependency edges, blocked/retried/rejected tasks.
- Her inference request için `latency_ms`, HTTP status, provider error, retry count.
- Tüm run için `elapsed_ms`, toplam model çağrıları, toplam token/Neuron bilgisi (varsa), toplam başarısızlık tipi.
- Derleme/başlatma sonucu, HTTP testleri, sqlite persistence test, stdout/stderr, exit code.
- Testlerin başarı/başarısızlık yüzdeleri, gerçek dosya çıktıları ve `artifacts` klasörü.

En az şu hataları ayrı sınıflandır: `parse_error`, `missing_capability`, `dependency_cycle`, `incorrect_code`, `integration_mismatch`, `runtime_error`, `test_failure`, `provider_error`, `budget_exceeded`, `timeout`.

### 7.3 Adil karşılaştırma

- Bütün kollara aynı doğal dil görev ve aynı endpoint contract verilmeli.
- B ve C daha çok model çağrısı kullanacak; A'ya **eşdeğer toplam token / inference çağrısı bütçesi** tanımlanmalı. Tek-shot baseline'a ek olarak, aynı küçük modele aynı bütçede self-revision izni verilen bir A2 baseline'ı eklemek bilimsel açıdan daha adil olabilir.
- Özel role promptlar, hazır çözümlere dönüşmemeli. Prompt, görev tanımı ve çıktı biçimi verebilir; uygulamanın hazır kodunu gömmemeli.
- C'nin B'den iyi çıkması, dynamic planning için en anlamlı sinyal.
- Sadece tek başarılı örnek veya seçilmiş video, sistematik başarı iddiası için yeterli değil.

## 8. Benchmark planı

### 8.1 İlk smoke test (tek görev)

Önce Task API için A, B ve C çalıştır. Kod üretiminden sonra Python servisini başlat, HTTP testlerini çalıştır, uygulamayı kapat ve SQLite dosyasını doğrula. `POST`, `GET`, `PATCH`, `DELETE`, invalid input, missing ID ve process restart sonrası persistence test et.

### 8.2 İlk 20 görev

Task API varyasyonları, not yönetimi, basit inventory, contact API, todo CRUD + arama/filtreleme, kullanıcı kayıt doğrulaması, tek tablo/ilişkili iki tablo, pagination, duplicate validation, sıralama, transaction gerektiren basit değişiklikler vb. Seçilen uygulama alanı yine Python + SQLite olacak; bu deneyin başlangıç scope'u bilinçli sınırlıdır.

Codex örnekleri önceden listelesin, testleri bağımsız oluştursun, sonra deney başlamadan benchmark'ı **dondursun**. Sonuçlara bakıp gizli testleri değiştirmesin.

### 8.3 Sonraki deneyler (ilk MVP DEĞİL)

- `265M / 360M / 600M / 1B` model boyutları: uzmanlığın alt sınırı.
- `4 / 12 / 30` mikro uzman işlevine ayrıştırma: beceri atomizasyonuyla doğruluk ve koordinasyon maliyeti eğrisi.
- Gerçek fine-tune veya LoRA ile sadece prompt-rol arasındaki fark.
- Sabit tech stack yerine kısıta göre teknoloji seçme ve tradeoff değerlendirme.
- Tarayıcı WebGPU gerçek worker ağı / WSS gecikmesi ve güvenilirlik.
- Önceden tanımlanmayan bir gereksinimi uzmanların `proposed_tasks` üzerinden fark etme başarısı.

## 9. Beklenen repo yapısı

```text
micro-swarm/
  README.md
  docs/
    RESEARCH_BRIEF.md
    HYPOTHESES.md
    LIMITATIONS.md
  src/
    cli.ts
    config.ts
    provider/
      cloudflare.ts
      mock.ts
    engine/
      planner.ts
      capability-graph.ts
      task-state.ts
      scheduler.ts
      budgets.ts
    experts/
      prompts.ts
      registry.json
      schemas.ts
    execution/
      artifact-writer.ts
      sandbox.ts
      test-runner.ts
    experiments/
      baseline.ts
      fixed-sequence.ts
      dynamic-graph.ts
      metrics.ts
  benchmarks/
    tasks.json
    fixtures/
    tests/
  runs/             # gitignored outputs
  .env.example
  package.json
  tsconfig.json
```

Repo ağacı öneridir; Codex daha az dosyalı, basit bir uygulama seçebilir. Gereksiz mimari soyutlaması yapma.

## 10. Codex için sıralı görev listesi ve teslim şartları

### Faz 1 — Çalışan iskelet

1. `README.md`, `.env.example`, config, basit CLI ve mock AI provider oluştur.
2. Cloudflare API entegrasyonu yap. API anahtarı yoksa testler mock ile devam etsin; gerçek provider bağlantısını bağımsız `smoke:provider` komutuyla doğrula.
3. Capability registry + JSON output validation + task-state + basic graph planner yaz.
4. A/B/C koşumlarını aynı `run-scenario` arayüzüyle çalıştır. Run'ların izolasyonunu sağla.
5. Üretilen Python/SQLite uygulamaları için güvenli test runner ve gizli kabul testlerini ekle.
6. JSONL log, hata kategorileri, toplam süre, çağrı sayısı ve basit Markdown karşılaştırma raporu üret.
7. Her şey için kısa bir `npm run smoke` ve `npm run benchmark` komutu sun.

### Faz 2 — Minimum gerçekten çalışan örnek

- İlk görev için **A, B ve C'nin gerçek Cloudflare çağrılarıyla** çalıştığını göster; çıktılar bozuksa da test loglarında açıkça göster.
- En az bir çalışır uygulama elde edilmeye çalışılsın ama yoksa sonuç uydurulmasın.
- Servis HTTP testlerini koşsun; SQLite persistence testleri yürüsün.
- Bir run için `runs/<run_id>/` içine başlangıç istemi, çağrı izleri, graph, üretilen dosyalar ve test özeti bırakılsın.

### Faz 3 — İlk araştırma raporu

- 20 görev x 3 kol benchmark'ı çalıştırmaya hazır hale getir; Cloudflare quota yetersizse **kendiliğinden ücretli moda geçme**, düşük maliyetli küçük örneklemle gerçek bulguları göster.
- Sonuç tablosu: `A/B/C × pass count × total tokens × wall-clock × provider failures × test failure categories`.
- Hangi alt görevlerin başarıyı veya başarısızlığı belirlediğini dürüstçe analiz eden kısa `RESULTS.md` yaz.

### Teslim kriterleri

- Kod çalıştırılabilir ve README ile kurulabilir.
- Gizli cloud secret repoda yok.
- Sonuçları tekrar oynatmaya (replay/mock) yeterli trace var.
- Benchmark, tek kod yoluyla A/B/C karşılaştırıyor.
- Deterministik planner içinde hiç LLM çağrısı yok.
- Uzman ve provider katmanları birbirinden bağımsız.
- Hiçbir çözüm, önceden hazır backend kodu şablonuyla sahte şekilde üretilmiyor.
- Hata alan run rapora dahil ediliyor; elde edilmeyen başarı iddia edilmiyor.

## 11. Şu anda yapılmayacaklar (scope guardrails)

- Gerçek 265M model eğitmek/fine-tune etmek.
- Bir bilgisayarda dört farklı LLM yüklemek.
- Chrome extension, WebGPU, WSS relay, worker marketplace kurmak.
- 1B genel muhakeme planner eklemek.
- Yeni DB, hesap sistemi, ödeme/billing, puan/ödül, yönetim paneli kurmak.
- LLM'yi otomatik test sonucunun tek hakemi yapmak.
- Güvenilirliğini kanıtlamadığımız worker'lara gerçek kullanıcı kodu/verisi göndermek.
- İlk başarısızlıkta kapsamı büyütmek veya güçlü modele geçip hipotezi değiştirmek.

## 12. Riskler ve yanlış yorumlama ihtimalleri

1. **Ayrıştırılabilirlik, birleşebilirlik değildir.** Her alt görev doğruysa bile entegrasyon başarısız olabilir.
2. **Çarpan hata riski:** 20 bağımsız kritik adımın her biri %95 doğruysa hepsinin doğru olma ihtimali `0.95^20 ≈ %35,8` olur. Gerçek görevlerin hata bağımsızlığı varsayımı güçlüdür; bu yalnızca riskin ilustrasyonudur.
3. **Bağlam maliyeti:** Uzman daraldıkça daha fazla dış bağlam ihtiyacı doğabilir.
4. **Planlama kapsamı:** Graph ancak temsil edebildiği gereksinimleri bulur; yeni kombinasyonlar çoğu zaman bilinen işlerden oluşsa da her ihtiyaç otomatik keşfedilmez.
5. **Uygun olmayan uzman granülerliği:** 4 role göre 30 küçük rol daha kötü olabilir. Daha küçük her zaman daha iyi değildir.
6. **Tek model rol simülasyonu:** İlk deney yalnızca prompt farklılaştırılmış aynı ağırlıklarla yapılır; kolektif fine-tune zekâsı hakkında doğrudan kanıt sağlamaz.
7. **Modelin yetersiz JSON uyumu:** Küçük modeller formatı sık bozabilir; bunu başarısızlık metriği olarak ölç.
8. **Bütçe yanlılığı:** Çok sayıda çağrı/çok fazla token, koordinasyonun katkısıyla karıştırılmamalı.
9. **Eksik yürütme ortamı:** Test runner kötü kurulmuşsa doğru kodu yanlışlıkla başarısız sayabilir; altın referans uygulamayla runner'ı test et.
10. **Cloudflare kota ve geçicilik:** erişilebilirlik, maliyet ve limitler değişebilir; küçük başlangıç bütçesi ve fail-fast kullan.

## 13. İletişim ve raporlama biçimi

Codex README ve sonuçlarda şu ayrımı açık tutmalı:

- **Kanıtlanan:** Gerçekte koşulan testler ve gözlenen sonuçlar.
- **Sinyal:** Küçük örneklemdeki olumlu gelişme.
- **Kanıtlanmayan:** 265M hedefi, fine-tune etkisi, açık ağı ölçekleme, genel zekâ, özgünlük/patent iddiaları.

Çalışan bir demo çıkarsa kamuya verilecek dürüst başlık önerisi:

> *Can a tiny language model build working software when orchestrated by a deterministic decision engine?*

Uzun vadeli araştırma tezi:

> *Can a network of sub-300M specialized models solve software engineering tasks through decentralized, LLM-free orchestration?*

---

# CODEX'E VERİLECEK DOĞRUDAN İSTEM

Bu dokümanı proje şartnamesi olarak kabul et. Yeni ve boş bir `micro-swarm` projesi oluştur. İlk olarak sadece **Faz 1** ve mümkünse **Faz 2** uygulamasını inşa et. Tek bir makinede birden fazla LLM inference çalıştırma. Cloudflare Workers AI `@cf/meta/llama-3.2-1b-instruct` modelini ortak provider olarak kullan; A (tek model), B (sabit sıralı dört rol), C (deterministik dinamik graph) karşılaştırmasını kur. Her kol aynı backend testleriyle ölçülsün. Başlangıç deneyinde Python + SQLite REST Task API hedefi kullan. Güvenli test runner, yazılabilir izole output klasörü, model çağrı logları ve maksimum token/istek/para bütçesi ekle. LLM anahtarları veya Cloudflare hesabı mevcut değilse mock mode ile repo'yu çalışır teslim et; erişim varsa yalnızca izin verilen ücretsiz kota içinde gerçek smoke test yap. Sonuç uydurma, test geçmeyen kodu başarı diye raporlama ve MVP dışı uzun vadeli ağ/extension/fine-tune özelliklerini geliştirme. Kullanılacak komutları ve sonraki deney adımlarını README'ye yaz.
