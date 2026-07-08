import re
from random import choice


PLATFORM_LABELS = {
    "telegram": "Telegram",
    "x": "X (Twitter)",
    "twitter": "X (Twitter)",
    "vk": "ВКонтакте",
    "instagram": "Instagram",
    "linkedin": "LinkedIn",
    "youtube": "YouTube",
    "tiktok": "TikTok",
}

TONE_STYLES = {
    "professional": {
        "opener": "Представляем обновление:",
        "cta": "Подробнее на нашем сайте.",
        "emoji": False,
    },
    "friendly": {
        "opener": "Привет! У нас отличные новости 👋",
        "cta": "Загляните — будет интересно!",
        "emoji": True,
    },
    "bold": {
        "opener": "🔥 Важное объявление",
        "cta": "Не пропустите — действуйте сейчас.",
        "emoji": True,
    },
}


def _detect_platforms(prompt: str, configured: list[str]) -> list[str]:
    prompt_lower = prompt.lower()
    detected = []

    keywords = {
        "telegram": ["telegram", "телеграм", "тг"],
        "x": ["twitter", "x.com", " твит", "twitter/x"],
        "vk": ["vk", "вконтакте", "вк"],
        "instagram": ["instagram", "инстаграм", "insta"],
        "linkedin": ["linkedin", "линкедин"],
        "youtube": ["youtube", "ютуб"],
        "tiktok": ["tiktok", "тикток"],
    }

    for platform, words in keywords.items():
        if any(word in prompt_lower for word in words):
            detected.append(platform)

    if detected:
        return detected

    return configured or ["telegram", "x", "vk"]


def _extract_topic(prompt: str) -> str:
    cleaned = re.sub(
        r"(настроим|сделай|создай|напиши|подготовь|сгенерируй)\s+",
        "",
        prompt,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"(пост|публикацию|контент|текст)\s+(для|в|на)\s+.*?(соцсет|платформ).*?[,.]",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .,")

    if len(cleaned) < 8:
        return prompt.strip()

    return cleaned[:280]


def _hashtags(topic: str) -> str:
    words = re.findall(r"[а-яa-zA-Z]{4,}", topic.lower())
    unique = []
    for word in words[:4]:
        if word not in unique:
            unique.append(f"#{word.capitalize()}")
    return " ".join(unique) if unique else "#OpenWeb #Бизнес"


def generate_social_post(prompt: str, tone: str = "professional", platforms: list[str] | None = None) -> str:
    platforms = platforms or ["telegram", "x", "vk"]
    target_platforms = _detect_platforms(prompt, platforms)
    style = TONE_STYLES.get(tone, TONE_STYLES["professional"])
    topic = _extract_topic(prompt)
    tags = _hashtags(topic)

    sections = [
        f"**Задание:** {prompt.strip()}",
        "",
        f"**Тон:** {tone}",
        "",
    ]

    for platform in target_platforms:
        label = PLATFORM_LABELS.get(platform, platform)
        body = f"{style['opener']}\n\n{topic}\n\n{style['cta']}"

        if platform in ("x", "twitter"):
            short_body = body.replace("\n\n", " ").strip()
            if len(short_body) > 260:
                short_body = short_body[:257] + "..."
            post = f"{short_body}\n\n{tags}"
        elif platform == "telegram":
            post = f"{body}\n\n{tags}"
        else:
            post = f"{body}\n\n{tags}"

        if style["emoji"] and "👋" not in post and platform != "linkedin":
            post = post.replace(topic, topic, 1)

        sections.extend([f"### {label}", post, ""])

    sections.extend(
        [
            "---",
            "💡 *Совет:* отредактируйте текст под голос бренда перед публикацией.",
            f"*Вариант заголовка:* {choice(['Новости команды', 'Обновление OpenWeb', 'Для вашего бизнеса'])}",
        ]
    )

    return "\n".join(sections)


def generate_agent_reply(prompt: str, tone: str = "professional", platforms: list[str] | None = None) -> str:
    prompt_lower = prompt.lower()

    social_keywords = [
        "пост",
        "соцсет",
        "telegram",
        "телеграм",
        "twitter",
        "x.com",
        "vk",
        "вконтакте",
        "instagram",
        "публикац",
        "контент",
    ]

    if any(keyword in prompt_lower for keyword in social_keywords):
        return generate_social_post(prompt, tone=tone, platforms=platforms)

    return (
        f"Понял задачу: «{prompt.strip()}».\n\n"
        "Я подготовлю черновик. Уточните, пожалуйста:\n"
        "• Целевую аудиторию\n"
        "• Желаемый тон (деловой / дружелюбный / смелый)\n"
        "• Платформу, если это контент для соцсетей\n\n"
        "Пример запроса: «Настроим пост для Telegram и VK о запуске нового продукта»."
    )
