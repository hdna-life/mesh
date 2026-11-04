# M0.1 — Protocol Independence

M0'ın JSON protokolü engelini ayrı bir sürümde ölçer. Orijinal [M0 sonuçları](../RESULTS.md) ve kaynakları korunur. Docker, yeni model, yeni Python ortamı veya npm bağımlılığı eklenmez; üst projenin .env, .venv ve günlük bütçe ledger'ı kullanılır.

Önceden dondurulmuş ölçüm: 20 stateless çağrı, seed 1001..1020, temperature=0, aynı stok/rezervasyon görevinin app.py dosyası, her çağrıda en fazla 2048 çıktı token. Model dosya adı/yolu veya JSON metadata üretmez. Çıkarıcı ham kodu ya da tek desteklenen kod bloğunu seçer; Python AST kontrolü ve sabit dosyaya yazım başarılıysa çıktı otomatik kullanılabilir sayılır. Bu bir çalışma/doğruluk testi değildir.

**Kapı: en az 18/20 (%90).** Geçerse aynı inventory görevinin A/A2/B/C uygulama testleri yapılır. Geçmezse ana göreve dönülmez. Provider/eksik örnek nedeniyle 20 tamamlanmazsa kapı geçilemez. Yanıtlar başka örneklere aktarılmaz, başarısızlıklar elle onarılmaz veya paydadan çıkarılmaz.

```sh
cd /Users/berdincozer/Desktop/mesh/micro-swarm/m01
npm test
npm run smoke -- --arms A,A2,B,C   # sadece açıkça etiketli mock
npm run protocol                  # 20 gerçek çağrı + yalnızca kapı geçerse A/A2/B/C
```

Gerçek komut Workers Free doğrulaması ister. Ortak UTC günlük Neuron rezervasyon tavanı 2500'dür; M0 tüketimi silinmez. Ücretli moda geçilmez. Codex'in dış sandbox'ı içinde gerçek uygulama testleri için komutun araç izni gerekebilir. Model kaynakları yalnızca kalibre edilmiş macOS Seatbelt içinde çalışır; AST kontrolü kaynak kodu çalıştırmaz. Sistem servisleri ve kaynak limitlerinin sınırları üst projenin LIMITATIONS belgesindedir.

Protokol `benchmarks/frozen.json` hash manifestiyle dondurulmuştur. [Ön kayıt](docs/PROTOCOL.md) ve 20 çağrı listesi bu manifeste dahildir. Deney sonuçlarına göre aynı sürümün parser/prompt/testleri değiştirilemez.

Sonuçlar RESULTS.md, APPLICATION_RESULTS.md ve results/M01-evidence.json içine yazılır; bütün raw prompt/cevaplar, çıkarım kararları, kaynak dosyaları ve test tanıları runs içinde korunur. Protokol geçişi, uygulama başarısı ve koordinasyon kazancı ayrı sonuçlardır. 20 aynı-görev çağrısı 20 farklı görev veya istatistiksel bağımsız örneklem olarak sunulmaz.
