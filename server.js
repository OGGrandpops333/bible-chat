'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : '*';

const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS }
});

const PORT = process.env.PORT || 3000;

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public')));

// REST endpoint: Verse of the Day (accessible before socket login)
app.get('/api/verse-of-day', (_req, res) => {
  res.json(getVerseOfTheDay());
});

// ─── In-memory state ────────────────────────────────────────────────────────

// rooms: Map<roomName, { messages: [], participants: Map<socketId, {name, color}> }>
const rooms = new Map();

// Default rooms that always exist
const DEFAULT_ROOMS = ['General', 'Prayer', 'Bible Study', 'Testimony'];

DEFAULT_ROOMS.forEach((name) => {
  rooms.set(name, { messages: [], participants: new Map() });
});

// ─── Bible data ──────────────────────────────────────────────────────────────

const VERSES_OF_THE_DAY = [
  { ref: 'John 3:16', text: 'For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.' },
  { ref: 'Psalm 23:1', text: 'The Lord is my shepherd, I lack nothing.' },
  { ref: 'Proverbs 3:5-6', text: 'Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.' },
  { ref: 'Philippians 4:13', text: 'I can do all this through him who gives me strength.' },
  { ref: 'Romans 8:28', text: 'And we know that in all things God works for the good of those who love him, who have been called according to his purpose.' },
  { ref: 'Jeremiah 29:11', text: 'For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, plans to give you hope and a future.' },
  { ref: 'Isaiah 40:31', text: 'But those who hope in the Lord will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and not be faint.' },
  { ref: 'Matthew 11:28', text: 'Come to me, all you who are weary and burdened, and I will give you rest.' },
  { ref: 'Psalm 46:1', text: 'God is our refuge and strength, an ever-present help in trouble.' },
  { ref: 'Galatians 5:22-23', text: 'But the fruit of the Spirit is love, joy, peace, forbearance, kindness, goodness, faithfulness, gentleness and self-control.' },
  { ref: '2 Timothy 3:16-17', text: 'All Scripture is God-breathed and is useful for teaching, rebuking, correcting and training in righteousness, so that the servant of God may be thoroughly equipped for every good work.' },
  { ref: 'Joshua 1:9', text: 'Have I not commanded you? Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.' },
  { ref: 'Matthew 5:14-16', text: 'You are the light of the world. A town built on a hill cannot be hidden. Neither do people light a lamp and put it under a bowl. Instead they put it on its stand, and it gives light to everyone in the house. In the same way, let your light shine before others, that they may see your good deeds and glorify your Father in heaven.' },
  { ref: '1 Corinthians 13:13', text: 'And now these three remain: faith, hope and love. But the greatest of these is love.' },
  { ref: 'Psalm 119:105', text: 'Your word is a lamp for my feet, a light on my path.' },
  { ref: 'Romans 12:2', text: 'Do not conform to the pattern of this world, but be transformed by the renewing of your mind. Then you will be able to test and approve what God\'s will is—his good, pleasing and perfect will.' },
  { ref: 'Ephesians 2:8-9', text: 'For it is by grace you have been saved, through faith—and this is not from yourselves, it is the gift of God—not by works, so that no one can boast.' },
  { ref: 'James 1:17', text: 'Every good and perfect gift is from above, coming down from the Father of the heavenly lights, who does not change like shifting shadows.' },
  { ref: '1 John 4:19', text: 'We love because he first loved us.' },
  { ref: 'Hebrews 11:1', text: 'Now faith is confidence in what we hope for and assurance about what we do not see.' },
  { ref: 'Revelation 21:4', text: 'He will wipe every tear from their eyes. There will be no more death or mourning or crying or pain, for the old order of things has passed away.' },
  { ref: 'Matthew 22:37-39', text: 'Jesus replied: "Love the Lord your God with all your heart and with all your soul and with all your mind. This is the first and greatest commandment. And the second is like it: Love your neighbor as yourself."' },
  { ref: 'Psalm 37:4', text: 'Take delight in the Lord, and he will give you the desires of your heart.' },
  { ref: '2 Corinthians 5:17', text: 'Therefore, if anyone is in Christ, the new creation has come: The old has gone, the new is here!' },
  { ref: 'Colossians 3:23', text: 'Whatever you do, work at it with all your heart, as working for the Lord, not for human masters.' },
  { ref: 'John 14:6', text: 'Jesus answered, "I am the way and the truth and the life. No one comes to the Father except through me."' },
  { ref: 'Micah 6:8', text: 'He has shown you, O mortal, what is good. And what does the Lord require of you? To act justly and to love mercy and to walk humbly with your God.' },
  { ref: 'Genesis 1:1', text: 'In the beginning God created the heavens and the earth.' },
  { ref: '1 Peter 5:7', text: 'Cast all your anxiety on him because he cares for you.' },
  { ref: 'Psalm 27:1', text: 'The Lord is my light and my salvation—whom shall I fear? The Lord is the stronghold of my life—of whom shall I be afraid?' }
];

// A larger embedded verse database for keyword search
const VERSE_DB = [
  { ref: 'Genesis 1:1', text: 'In the beginning God created the heavens and the earth.' },
  { ref: 'Genesis 1:27', text: 'So God created mankind in his own image, in the image of God he created them; male and female he created them.' },
  { ref: 'Psalm 23:1-4', text: 'The Lord is my shepherd, I lack nothing. He makes me lie down in green pastures, he leads me beside quiet waters, he refreshes my soul. He guides me along the right paths for his name\'s sake. Even though I walk through the darkest valley, I will fear no evil, for you are with me; your rod and your staff, they comfort me.' },
  { ref: 'Psalm 27:1', text: 'The Lord is my light and my salvation—whom shall I fear? The Lord is the stronghold of my life—of whom shall I be afraid?' },
  { ref: 'Psalm 46:1', text: 'God is our refuge and strength, an ever-present help in trouble.' },
  { ref: 'Psalm 91:1-2', text: 'Whoever dwells in the shelter of the Most High will rest in the shadow of the Almighty. I will say of the Lord, "He is my refuge and my fortress, my God, in whom I trust."' },
  { ref: 'Psalm 119:105', text: 'Your word is a lamp for my feet, a light on my path.' },
  { ref: 'Proverbs 3:5-6', text: 'Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.' },
  { ref: 'Isaiah 40:31', text: 'But those who hope in the Lord will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and not be faint.' },
  { ref: 'Isaiah 53:5', text: 'But he was pierced for our transgressions, he was crushed for our iniquities; the punishment that brought us peace was on him, and by his wounds we are healed.' },
  { ref: 'Jeremiah 29:11', text: 'For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, plans to give you hope and a future.' },
  { ref: 'Matthew 5:14-16', text: 'You are the light of the world. A town built on a hill cannot be hidden. Let your light shine before others, that they may see your good deeds and glorify your Father in heaven.' },
  { ref: 'Matthew 6:33', text: 'But seek first his kingdom and his righteousness, and all these things will be given to you as well.' },
  { ref: 'Matthew 11:28-30', text: 'Come to me, all you who are weary and burdened, and I will give you rest. Take my yoke upon you and learn from me, for I am gentle and humble in heart, and you will find rest for your souls. For my yoke is easy and my burden is light.' },
  { ref: 'Matthew 22:37-39', text: 'Jesus replied: "Love the Lord your God with all your heart and with all your soul and with all your mind." This is the first and greatest commandment. And the second is like it: "Love your neighbor as yourself."' },
  { ref: 'Matthew 28:19-20', text: 'Therefore go and make disciples of all nations, baptizing them in the name of the Father and of the Son and of the Holy Spirit, and teaching them to obey everything I have commanded you.' },
  { ref: 'John 1:1', text: 'In the beginning was the Word, and the Word was with God, and the Word was God.' },
  { ref: 'John 3:16', text: 'For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.' },
  { ref: 'John 3:17', text: 'For God did not send his Son into the world to condemn the world, but to save the world through him.' },
  { ref: 'John 10:10', text: 'The thief comes only to steal and kill and destroy; I have come that they may have life, and have it to the full.' },
  { ref: 'John 14:6', text: 'Jesus answered, "I am the way and the truth and the life. No one comes to the Father except through me."' },
  { ref: 'John 15:13', text: 'Greater love has no one than this: to lay down one\'s life for one\'s friends.' },
  { ref: 'John 16:33', text: 'I have told you these things, so that in me you may have peace. In this world you will have trouble. But take heart! I have overcome the world.' },
  { ref: 'Romans 3:23', text: 'For all have sinned and fall short of the glory of God.' },
  { ref: 'Romans 6:23', text: 'For the wages of sin is death, but the gift of God is eternal life in Christ Jesus our Lord.' },
  { ref: 'Romans 8:28', text: 'And we know that in all things God works for the good of those who love him, who have been called according to his purpose.' },
  { ref: 'Romans 8:38-39', text: 'For I am convinced that neither death nor life, neither angels nor demons, neither the present nor the future, nor any powers, neither height nor depth, nor anything else in all creation, will be able to separate us from the love of God that is in Christ Jesus our Lord.' },
  { ref: 'Romans 10:9', text: 'If you declare with your mouth, "Jesus is Lord," and believe in your heart that God raised him from the dead, you will be saved.' },
  { ref: 'Romans 12:2', text: 'Do not conform to the pattern of this world, but be transformed by the renewing of your mind.' },
  { ref: '1 Corinthians 13:4-7', text: 'Love is patient, love is kind. It does not envy, it does not boast, it is not proud. It does not dishonor others, it is not self-seeking, it is not easily angered, it keeps no record of wrongs. Love does not delight in evil but rejoices with the truth. It always protects, always trusts, always hopes, always perseveres.' },
  { ref: '1 Corinthians 13:13', text: 'And now these three remain: faith, hope and love. But the greatest of these is love.' },
  { ref: '2 Corinthians 5:17', text: 'Therefore, if anyone is in Christ, the new creation has come: The old has gone, the new is here!' },
  { ref: 'Galatians 5:22-23', text: 'But the fruit of the Spirit is love, joy, peace, forbearance, kindness, goodness, faithfulness, gentleness and self-control. Against such things there is no law.' },
  { ref: 'Ephesians 2:8-9', text: 'For it is by grace you have been saved, through faith—and this is not from yourselves, it is the gift of God—not by works, so that no one can boast.' },
  { ref: 'Ephesians 6:10-11', text: 'Finally, be strong in the Lord and in his mighty power. Put on the full armor of God, so that you can take your stand against the devil\'s schemes.' },
  { ref: 'Philippians 4:6-7', text: 'Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God. And the peace of God, which transcends all understanding, will guard your hearts and your minds in Christ Jesus.' },
  { ref: 'Philippians 4:13', text: 'I can do all this through him who gives me strength.' },
  { ref: 'Colossians 3:23', text: 'Whatever you do, work at it with all your heart, as working for the Lord, not for human masters.' },
  { ref: '2 Timothy 3:16-17', text: 'All Scripture is God-breathed and is useful for teaching, rebuking, correcting and training in righteousness, so that the servant of God may be thoroughly equipped for every good work.' },
  { ref: 'Hebrews 11:1', text: 'Now faith is confidence in what we hope for and assurance about what we do not see.' },
  { ref: 'Hebrews 13:8', text: 'Jesus Christ is the same yesterday and today and forever.' },
  { ref: 'James 1:17', text: 'Every good and perfect gift is from above, coming down from the Father of the heavenly lights, who does not change like shifting shadows.' },
  { ref: 'James 4:7', text: 'Submit yourselves, then, to God. Resist the devil, and he will flee from you.' },
  { ref: '1 Peter 5:7', text: 'Cast all your anxiety on him because he cares for you.' },
  { ref: '1 John 1:9', text: 'If we confess our sins, he is faithful and just and will forgive us our sins and purify us from all unrighteousness.' },
  { ref: '1 John 4:7-8', text: 'Dear friends, let us love one another, for love comes from God. Everyone who loves has been born of God and knows God. Whoever does not love does not know God, because God is love.' },
  { ref: '1 John 4:19', text: 'We love because he first loved us.' },
  { ref: 'Revelation 3:20', text: 'Here I am! I stand at the door and knock. If anyone hears my voice and opens the door, I will come in and eat with that person, and they with me.' },
  { ref: 'Revelation 21:4', text: 'He will wipe every tear from their eyes. There will be no more death or mourning or crying or pain, for the old order of things has passed away.' },
  { ref: 'Joshua 1:9', text: 'Have I not commanded you? Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.' },
  { ref: 'Micah 6:8', text: 'He has shown you, O mortal, what is good. And what does the Lord require of you? To act justly and to love mercy and to walk humbly with your God.' }
];

// Bible Bot context/study data keyed by keyword
const BOT_CONTEXTS = {
  love: {
    context: 'Love (Greek: agape) in the New Testament describes God\'s unconditional love for humanity. The greatest command is to love God and neighbor (Matthew 22:37-39).',
    study: 'The Greek word "agape" used in John 3:16 describes a self-sacrificial, unconditional love. Unlike "eros" (romantic love) or "philia" (friendship), agape chooses to love regardless of worthiness. 1 Corinthians 13 gives the most complete description of agape in action.'
  },
  faith: {
    context: 'Faith (Greek: pistis) means trust, reliance, and commitment. Hebrews 11:1 defines it as confidence in what we hope for. Faith is not merely intellectual assent but active trust in God.',
    study: 'The book of Hebrews chapter 11 is called the "Hall of Faith," listing Old Testament heroes who acted on their belief without seeing the outcome. James 2:17 balances this by noting that "faith without works is dead," meaning genuine faith produces action.'
  },
  grace: {
    context: 'Grace (Greek: charis) is God\'s unmerited favor and empowerment. Ephesians 2:8-9 teaches that salvation is by grace through faith, not works.',
    study: 'In Reformed theology, grace is categorized as common grace (bestowed on all humanity) and saving grace (given to believers). The Apostle Paul\'s letters extensively develop the doctrine of grace as the foundation of the New Covenant, contrasting with law-based righteousness.'
  },
  prayer: {
    context: 'Prayer is direct communication with God. Jesus taught the Lord\'s Prayer (Matthew 6:9-13) as a model. Philippians 4:6-7 encourages bringing all concerns to God in prayer.',
    study: 'The Bible shows five primary types of prayer: praise/worship, confession, thanksgiving, supplication (personal needs), and intercession (praying for others). Jesus\' High Priestly Prayer in John 17 is considered one of the most theologically rich prayers in Scripture.'
  },
  salvation: {
    context: 'Salvation (Greek: soteria) means deliverance and rescue from sin. Romans 6:23 shows the problem and solution: sin leads to death, but God\'s gift is eternal life through Christ.',
    study: 'Theologians distinguish between justification (declared righteous), sanctification (growing in righteousness), and glorification (final state of believers). The ordo salutis (order of salvation) describes the logical steps: foreknowledge, predestination, calling, regeneration, faith, justification, sanctification, glorification.'
  },
  hope: {
    context: 'Biblical hope (Greek: elpis) is not wishful thinking but confident expectation based on God\'s promises. Romans 15:13 calls God the "God of hope." Our hope is anchored in Christ\'s resurrection.',
    study: 'The resurrection of Christ is called the "first fruits" (1 Corinthians 15:20), guaranteeing the future resurrection of believers. The "blessed hope" (Titus 2:13) refers to Christ\'s return. Peter writes that we have a "living hope" (1 Peter 1:3) that cannot perish.'
  },
  peace: {
    context: 'Biblical peace (Hebrew: shalom; Greek: eirene) encompasses wholeness, wellbeing, and harmony. Jesus is called the "Prince of Peace" (Isaiah 9:6). He promises peace that surpasses understanding (Philippians 4:7).',
    study: 'Shalom in the Old Testament describes comprehensive flourishing—not merely the absence of conflict but the presence of everything good. In the New Testament, Christ is said to be "our peace" (Ephesians 2:14), having broken down the dividing wall between Jew and Gentile, and between humanity and God.'
  },
  forgiveness: {
    context: 'Forgiveness (Greek: aphiemi, aphesis) means to release or pardon. 1 John 1:9 promises God forgives when we confess. We are also called to forgive others as God forgave us (Colossians 3:13).',
    study: 'Jesus\' parable of the Prodigal Son (Luke 15:11-32) is perhaps the most vivid picture of divine forgiveness—the father runs to meet the returning son. The Greek word "aphiemi" means to release a debt. Biblically, forgiveness does not mean forgetting harm but releasing the debt and entrusting justice to God.'
  }
};

// ─── Bible Bot ────────────────────────────────────────────────────────────────

function getBotResponse(message, mode) {
  const lower = message.toLowerCase();

  // Try to find a matching keyword
  const matchedKey = Object.keys(BOT_CONTEXTS).find((k) => lower.includes(k));

  if (mode === 'A') {
    // Short & Encouraging
    const encouragements = [
      { text: 'God is with you! "I can do all things through Christ who strengthens me." — Philippians 4:13 💪', trigger: 'strength' },
      { text: 'You are loved! "For God so loved the world…" — John 3:16 ❤️', trigger: 'love' },
      { text: 'Stay hopeful! "For I know the plans I have for you," declares the Lord. — Jeremiah 29:11 🌟', trigger: 'hope' },
      { text: 'Keep trusting! "Trust in the Lord with all your heart." — Proverbs 3:5 🙏', trigger: 'trust' },
      { text: 'Be at peace! "The Lord is my shepherd, I lack nothing." — Psalm 23:1 🕊️', trigger: 'peace' },
      { text: 'You are forgiven! "If we confess our sins, he is faithful and just to forgive us." — 1 John 1:9 ✝️', trigger: 'forgiv' },
      { text: 'Press on! "Be strong and courageous… for the Lord your God will be with you." — Joshua 1:9 💫', trigger: 'fear' },
      { text: 'Rest in Him! "Come to me, all who are weary, and I will give you rest." — Matthew 11:28 😌', trigger: 'tired' }
    ];

    const match = encouragements.find((e) => lower.includes(e.trigger));
    if (match) return `📖 Bible Bot says: ${match.text}`;

    const defaults = [
      '📖 God loves you! "Neither height nor depth… shall separate us from the love of God." — Romans 8:38-39 ❤️',
      '📖 Be encouraged! "Cast all your anxiety on him because he cares for you." — 1 Peter 5:7 🙏',
      '📖 You\'ve got this! "I can do all this through him who gives me strength." — Philippians 4:13 💪',
      '📖 Shine bright! "You are the light of the world." — Matthew 5:14 ✨',
      '📖 Keep going! "The Lord your God is with you wherever you go." — Joshua 1:9 🌟'
    ];
    return defaults[Math.floor(Math.random() * defaults.length)];
  }

  if (mode === 'B') {
    // Contextual
    if (matchedKey) {
      const ctx = BOT_CONTEXTS[matchedKey];
      const verse = VERSE_DB.find((v) => v.text.toLowerCase().includes(matchedKey));
      const verseStr = verse ? `\n\n📜 "${verse.text}" — ${verse.ref}` : '';
      return `📖 **Bible Bot (Contextual Mode):**\n${ctx.context}${verseStr}`;
    }
    return '📖 **Bible Bot (Contextual Mode):** I\'d love to share more context! Try mentioning words like "love," "faith," "grace," "prayer," "salvation," "hope," "peace," or "forgiveness" and I\'ll provide biblical context.';
  }

  if (mode === 'C') {
    // Deep Study
    if (matchedKey) {
      const study = BOT_CONTEXTS[matchedKey];
      const verses = VERSE_DB.filter((v) => v.text.toLowerCase().includes(matchedKey)).slice(0, 3);
      const versesStr = verses.map((v) => `📜 "${v.text}" — ${v.ref}`).join('\n\n');
      return `📖 **Bible Bot (Deep Study Mode):**\n\n**Background:**\n${study.context}\n\n**Theological Depth:**\n${study.study}${versesStr ? '\n\n**Related Verses:**\n' + versesStr : ''}`;
    }
    return '📖 **Bible Bot (Deep Study Mode):** Ready for deep study! Mention topics like "love," "faith," "grace," "prayer," "salvation," "hope," "peace," or "forgiveness" for thorough theological exploration.';
  }

  return '📖 Bible Bot is here! Use /bot followed by a question or topic.';
}

// ─── Verse of the Day ─────────────────────────────────────────────────────────

function getVerseOfTheDay() {
  const dayIndex = Math.floor(Date.now() / 86400000) % VERSES_OF_THE_DAY.length;
  return VERSES_OF_THE_DAY[dayIndex];
}

// ─── Verse Search ─────────────────────────────────────────────────────────────

function searchVerses(query) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return VERSE_DB.filter(
    (v) => v.text.toLowerCase().includes(q) || v.ref.toLowerCase().includes(q)
  ).slice(0, 10);
}

// ─── Color assignment ─────────────────────────────────────────────────────────

const USER_COLORS = [
  '#E74C3C', '#3498DB', '#2ECC71', '#9B59B6', '#F39C12',
  '#1ABC9C', '#E67E22', '#C0392B', '#2980B9', '#27AE60',
  '#8E44AD', '#D35400', '#16A085', '#2C3E50', '#7D3C98'
];

let colorIndex = 0;
function assignColor() {
  const c = USER_COLORS[colorIndex % USER_COLORS.length];
  colorIndex++;
  return c;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getOrCreateRoom(name) {
  if (!rooms.has(name)) {
    rooms.set(name, { messages: [], participants: new Map() });
  }
  return rooms.get(name);
}

function getRoomList() {
  return Array.from(rooms.entries()).map(([name, data]) => ({
    name,
    participants: data.participants.size
  }));
}

// ─── Socket.IO ────────────────────────────────────────────────────────────────

// Helper: remove a socket from its current room and notify others
function leaveCurrentRoom(socket, roomName, userName) {
  const roomData = rooms.get(roomName);
  if (!roomData) return;
  roomData.participants.delete(socket.id);
  socket.leave(roomName);
  io.to(roomName).emit('participant_count', roomData.participants.size);
  io.to(roomName).emit('system_message', `${userName} has left the room.`);
  io.emit('room_list', getRoomList());
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let userName = null;
  let userColor = null;
  let botMode = 'A';

  // Send room list and verse of the day on connect
  socket.emit('room_list', getRoomList());
  socket.emit('verse_of_day', getVerseOfTheDay());

  // Join a room
  socket.on('join_room', ({ room, name, color }) => {
    // Validate inputs
    if (typeof room !== 'string' || typeof name !== 'string') return;
    const safeRoom = room.trim().slice(0, 50);
    const safeName = name.trim().slice(0, 30);
    if (!safeRoom || !safeName) return;

    // Leave current room if any
    if (currentRoom) {
      leaveCurrentRoom(socket, currentRoom, userName);
    }

    currentRoom = safeRoom;
    userName = safeName;
    userColor = color || assignColor();

    const roomData = getOrCreateRoom(currentRoom);
    roomData.participants.set(socket.id, { name: userName, color: userColor });
    socket.join(currentRoom);

    // Send recent message history (last 50)
    socket.emit('message_history', roomData.messages.slice(-50));
    socket.emit('participant_count', roomData.participants.size);

    // Notify others
    io.to(currentRoom).emit('participant_count', roomData.participants.size);
    socket.to(currentRoom).emit('system_message', `${userName} has joined the room.`);

    // Update room list for everyone
    io.emit('room_list', getRoomList());
  });

  // Send a chat message
  socket.on('chat_message', ({ text }) => {
    if (!currentRoom || !userName) return;
    if (typeof text !== 'string') return;
    const safeText = text.trim().slice(0, 1000);
    if (!safeText) return;

    const msg = {
      type: 'chat',
      user: userName,
      color: userColor,
      text: safeText,
      ts: Date.now()
    };

    const roomData = rooms.get(currentRoom);
    if (!roomData) return;
    roomData.messages.push(msg);
    // Keep last 200 messages per room
    if (roomData.messages.length > 200) {
      roomData.messages.splice(0, roomData.messages.length - 200);
    }

    io.to(currentRoom).emit('chat_message', msg);

    // Bible Bot trigger: message starts with /bot
    if (safeText.startsWith('/bot ')) {
      const query = safeText.slice(5).trim();
      const botReply = {
        type: 'bot',
        text: getBotResponse(query, botMode),
        ts: Date.now()
      };
      roomData.messages.push(botReply);
      io.to(currentRoom).emit('chat_message', botReply);
    }
  });

  // Change bot mode
  socket.on('set_bot_mode', ({ mode }) => {
    if (['A', 'B', 'C'].includes(mode)) {
      botMode = mode;
      socket.emit('bot_mode_changed', { mode });
    }
  });

  // Search verses
  socket.on('search_verses', ({ query }) => {
    if (typeof query !== 'string') return;
    const results = searchVerses(query.slice(0, 100));
    socket.emit('search_results', results);
  });

  // Create a new room
  socket.on('create_room', ({ name }) => {
    if (typeof name !== 'string') return;
    const safeName = name.trim().slice(0, 50);
    if (!safeName) return;
    getOrCreateRoom(safeName);
    io.emit('room_list', getRoomList());
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (currentRoom) {
      leaveCurrentRoom(socket, currentRoom, userName);
    }
  });
});

// ─── Start server ─────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`Bible Chat server running on http://localhost:${PORT}`);
});

module.exports = { app, server };
