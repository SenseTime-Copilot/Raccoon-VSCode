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

* Direct print out (For OpenAI & SenseCode only)

When Complition Mode set to `Print`, it direct print out the result into the active editor streamingly, for this purpose part of settings overwritten:

```json
{
    "max_tokens": 2048, // 2048 for OpenAI, 128 for SenseCode
    "n": 1, // Only 1 result required
    "stream" : true, // force on
    "stop": null // do not stop intentionally
}
```
