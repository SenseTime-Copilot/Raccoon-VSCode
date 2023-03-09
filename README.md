# SenseCode Coding Sensor

* Engine list example (Support OpenAI & TianQi style):

```json
"SenseCode.Engines": [
    {
        "label": "OpenAI",
        "url": "https://api.openai.com/v1/completions",
        "key": "<YOUR-OPENAI-API-KEY>",
        "config": {
            "model": "text-davinci-003",
            "n": 3,
            "max_tokens": 128,
            "stop": [
                "\n\n"
            ],
            "temperature": 0.8,
            "top_p": 0.95
        }
    },
    {
        "label": "TianQi",
        "url": "https://tianqi.aminer.cn/api/v2/multilingual_code_generate_adapt",
        "config": {
            "apikey": "<YOUR-TIANQI-API-KEY>",
            "apisecret": "<YOUR-TIANQI-API-SECRET>",
            "n": 3,
            "max_tokens": 128,
            "stop": [
                "\n\n"
            ],
            "temperature": 0.8,
            "top_p": 0.95,
            "top_k": 0
        }
    }
]
```
