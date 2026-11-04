# M0.1 — Protocol Independence

Tarih: 4 Kasım 2026. Önceki M0 negatif sonuçları değiştirilmez.

## Ön kayıt

20 ayrı, stateless inference isteği. Hepsi aynı stok/rezervasyon görevinin TAM app.py dosyasını üretir. Önceden sabitlenen farklı seed'ler 1001..1020; temperature=0; en fazla 2048 çıktı token. Her çağrı yeni bağlamla başlar, diğer cevapları görmez. Retry/insan düzeltmesi yoktur. Bu, sağlayıcı rastgeleliğinin istatistiksel bağımsızlığını garanti etmez; farklı request ve seed düzeyinde bağımsızlıktır. Aynı görevde protokol uyumunu ölçer, 20 farklı yazılım görevi değildir.

Dosya adı/yolu ve rol metadata'sı Decision Engine tarafından seçilir. Model yalnızca kaynak içerik üretir. JSON zorunluluğu kaldırılmıştır. Çıkarıcı yalnızca tüm cevabın ham kod olması veya tam olarak bir desteklenen fence bloğu (python/py/boş dil) içermesi durumunda kaynak seçer. Tek blok dışındaki açıklama deterministik biçimde atılır; çoklu/eksik/yanlış dilde fence, NUL ve aşırı uzun çıktı hata sayılır. Kod birleştirme, semantik tahmin, LLM ile format düzeltmesi veya insan müdahalesi yoktur.

Otomatik kullanılabilir çıktı: çıkarıcı tek bir kaynak seçer, Python ast.parse ile sözdizimi geçerli bulunur, yalnızca yorum/docstring yerine en az bir gerçek AST statement vardır ve engine'in sabit app.py yoluna güvenli biçimde yazılır. Import bağımlılığı, doğru HTTP davranışı veya business doğruluğu bu eşiğin parçası değildir. Saf ham sözdizimi başarısı ayrıca sayılır; extraction kazancı ayrı raporlanır. AST parse kodu çalıştırmaz.

Başarı kapısı: en az 18/20 otomatik kullanılabilir çıktı (%90). Payda her zaman 20 planlı bağımsız çağrıdır. Provider/bütçe nedeniyle eksik kalırsa ölçüm tamamlanmamıştır, oranla kapı geçilemez. Ham model yanıtı ve her çıkarma/sözdizimi/yazım hatası saklanır. Çıktı başarısı çalışan uygulama demek değildir.

Kapı geçilirse aynı inventory görevinin A/A2/B/C ana koşumu, tek dosya içerik protokolüyle yapılır. Bu dört koşum 20 örneğin dışında ve ayrıca raporlanır. Kapı geçilmezse ana deneye dönülmez. İlk 20 cevaba bakarak extractor/prompt gevşetilmez; sonraki değişiklik yeni sürüm gerektirir.

B/C schema.sql üretir, diğer roller yalnızca app.py üretir. Çok dosyalı model metadata veya proposed_tasks yoktur; kontrol engine'dedir. Python gate sonucu SQL çıkarma güvenilirliğini kanıtlamaz; ana koşumdaki SQL sonuçları ayrı ölçülür. A/A2/B/C 8192 toplam çıktı ve 48000 muhafazakâr toplam token tavanını korur; tüm prompt/çıkarıcı giderleri loglanır.

Workers Free doğrulaması ve ortak günlük ledger M0'dan devralınır. M0 tüketimi silinmez. Günlük toplam üst sınır 2500 Neuron; protokol 20 çağrı + kapı geçerse en fazla 16 ana görev çağrısı. Ücretli moda geçiş yoktur. Bu tavan 10.000 günlük ücretsiz tahsisten küçüktür; hesaptaki başka tüketiciler ledger dışında olabilir. Tüketim mümkün olduğunca API actual usage ile ayrıca raporlanır.

Docker yoktur. Gerçek uygulama yalnızca M0 ile aynı kalibre edilmiş macOS Seatbelt runner'ında çalıştırılır. M0'ın CPU/dosya/wall ve izlenen RSS/process group limitleri ile sistem okuma sınırları geçerlidir. .venv ve secret dosyaları kopyalanmaz.
