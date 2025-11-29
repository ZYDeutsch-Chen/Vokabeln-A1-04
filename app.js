// 强制刷新缓存机制 - 解决 Firefox 缓存问题
(function() {
    const CURRENT_VERSION = '1.0.6'; // 与 meta version 保持一致
    const VERSION_STORAGE_KEY = 'a1_vocab_version';
    
    // 检查版本并强制刷新
    const storedVersion = sessionStorage.getItem(VERSION_STORAGE_KEY);
    if (storedVersion && storedVersion !== CURRENT_VERSION) {
        // 版本不匹配，清除所有缓存并刷新
        sessionStorage.clear();
        // 注意：不清除 localStorage，保留用户学习进度
        // localStorage.removeItem('userConfig');
        // localStorage.removeItem('learningProgress');
        
        // 强制刷新（兼容不同浏览器）
        if (window.location.protocol === 'file:') {
            // 本地文件：添加时间戳参数强制刷新
            const separator = window.location.href.includes('?') ? '&' : '?';
            window.location.href = window.location.href.split('?')[0] + separator + '_v=' + CURRENT_VERSION + '&_t=' + Date.now();
        } else {
            // 网络文件：使用 reload
            window.location.reload(true);
        }
        return;
    }
    
    // 保存当前版本
    sessionStorage.setItem(VERSION_STORAGE_KEY, CURRENT_VERSION);
    
    // 对于本地文件，在 URL 中添加版本参数（用于破坏缓存）
    if (window.location.protocol === 'file:') {
        const currentUrl = window.location.href;
        if (!currentUrl.includes('_v=')) {
            const separator = currentUrl.includes('?') ? '&' : '?';
            const newUrl = currentUrl.split('?')[0] + separator + '_v=' + CURRENT_VERSION;
            window.history.replaceState({}, '', newUrl);
        }
    } else {
        // 网络文件：使用标准 URL API
        if (!window.location.search.includes('v=')) {
            try {
                const url = new URL(window.location.href);
                url.searchParams.set('v', CURRENT_VERSION);
                window.history.replaceState({}, '', url);
            } catch (e) {
                // URL API 不支持时忽略
            }
        }
    }
})();

// ==================== 核心数据结构 ====================

// 开发模式标志 - 控制日志输出
const IS_DEV = window.location.hostname === 'localhost' || 
               window.location.hostname === '127.0.0.1' || 
               window.location.protocol === 'file:';

// 条件化日志函数 - 仅在开发模式下输出
const log = IS_DEV ? console.log.bind(console) : () => {};
const warn = IS_DEV ? console.warn.bind(console) : () => {};
const error = IS_DEV ? console.error.bind(console) : () => {};

// 类别文件夹映射 - 统一管理，避免重复定义
const CATEGORY_FOLDERS = {
    '时间和日期': 'A1W01_Zeit_und_Datum_30Woerter',
    '提问和交流': 'A1W02_Fragen_und_Kommunikation_38Woerter',
    '衣服': 'A1W03_Kleidung_18Woerter',
    '食物': 'A1W04_Lebensmittel_45Woerter',
    '居住': 'A1W05_Wohnen_50Woerter',
    '交通和旅行': 'A1W06_Verkehr_und_Reisen_42Woerter',
    '购物': 'A1W07_Einkaufen_19Woerter',
    '看医生': 'A1W08_Arztbesuch_19Woerter',
    '银行和邮局': 'A1W09_Bank_und_Post_22Woerter',
    '学习和工作': 'A1W10_Lernen_und_Arbeit_36Woerter',
    '业余活动': 'A1W11_Freizeit_33Woerter',
    '文具': 'A1W12_Schreibwaren_15Woerter_Jugend',
    '动物': 'A1W13_Tiere_11Woerter_Jugend'
};

// 用户配置
let userConfig = {
    userType: null,      // 'adult' 或 'teenager'
    ability: null,       // 'normal', 'good', 'excellent'
    setupCompleted: false
};

// 主题排序配置
const themeOrder = {
    adult: [
        '时间和日期', '提问和交流', '食物', '居住', '交通和旅行',
        '购物', '看医生', '银行和邮局', '学习和工作', '业余活动'
    ],
    teenager: [
        '时间和日期', '提问和交流', '食物', '居住', '交通和旅行',
        '购物', '看医生', '银行和邮局', '学习和工作', '业余活动',
        '文具', '动物'
    ]
};

// 测试规则配置
const testRules = {
    normal: {
        test1: {
            passRate: 0.8,
            required: true,
            unlockTest2: false
        },
        test2: {
            passRate: null,
            required: false,
            hidden: true
        }
    },
    good: {
        test1: {
            passRate: 0.8,
            required: true,
            unlockTest2: true,
            unlockThreshold: 0.9  // 第一次测试需要≥90%才解锁
        },
        test2: {
            passRate: null,
            required: false,
            hidden: false
        }
    },
    excellent: {
        test1: {
            passRate: 0.9,
            required: true,
            unlockTest2: false
        },
        test2: {
            passRate: 0.7,
            required: true,
            hidden: false
        }
    }
};

// 学习进度
let learningProgress = {
    currentThemeIndex: 0,
    currentMode: 'learning',  // 'learning' 或 'test'
    currentTestType: null,    // 'test1' 或 'test2'
    currentTheme: null,
    themes: {},
    carryOverMistakes: []
};

// 当前测试状态
let currentTest = {
    type: null,           // 'meaning' 或 'gender'
    theme: null,
    questions: [],
    currentIndex: 0,
    answers: [],
    startTime: null
};

function ensureCarryOverStorage() {
    if (!learningProgress.carryOverMistakes) {
        learningProgress.carryOverMistakes = [];
    }
    return learningProgress.carryOverMistakes;
}

function getCarryOverMistakes() {
    return ensureCarryOverStorage();
}

function addCarryOverMistake(word) {
    if (!word || !word.noun) return;
    const carryOverList = ensureCarryOverStorage();
    const exists = carryOverList.some(item => item.noun === word.noun);
    if (exists) {
        return;
    }
    carryOverList.push({
        noun: word.noun,
        meaning: word.meaning,
        image: word.image,
        category: word.category,
        gender: word.gender,
        carryOver: true,
        originTheme: learningProgress.currentTheme || word.category
    });
}

function removeCarryOverMistake(noun) {
    if (!noun) return;
    const carryOverList = ensureCarryOverStorage();
    const nextList = carryOverList.filter(item => item.noun !== noun);
    learningProgress.carryOverMistakes = nextList;
}

function lockCardInteraction(card, duration = 700) {
    if (!card) return;
    card.dataset.interactionLocked = 'true';
    if (card._interactionLockTimer) {
        clearTimeout(card._interactionLockTimer);
    }
    card._interactionLockTimer = setTimeout(() => {
        delete card.dataset.interactionLocked;
        card._interactionLockTimer = null;
    }, duration);
}

// ==================== 交互保护 ====================

const PROTECTED_MEDIA_SELECTOR = '.noun-image, .noun-image-container, .card, .card-face, .card-inner';

function initInteractionGuards() {
    const shouldBlock = (target) => {
        const element = target instanceof Element ? target : target && target.parentElement;
        return element && element.closest(PROTECTED_MEDIA_SELECTOR);
    };
    
    document.addEventListener('contextmenu', (event) => {
        if (shouldBlock(event.target)) {
            event.preventDefault();
        }
    });
    
    document.addEventListener('dragstart', (event) => {
        if (event.target && event.target.matches && event.target.matches('.noun-image')) {
            event.preventDefault();
        }
    });
}

// ==================== 工具函数 ====================

// DOM元素缓存 - 统一管理，减少重复查询
const domCache = {
    setupModal: null,
    fixedTopBar: null,
    unlockModal: null,
    retryModal: null,
    cardsContainer: null,
    headerDescription: null,
    totalCountElement: null,
    currentThemeName: null,
    testProgress: null,
    testInstruction: null,
    themeList: null,
    progressCompleted: null,
    progressLearning: null,
    progressLocked: null,
    // 通用获取方法 - 如果缓存中没有，则查询并缓存
    get: function(id) {
        const cacheKey = id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        if (!this[cacheKey]) {
            const element = document.getElementById(id);
            if (element) {
                this[cacheKey] = element;
            }
        }
        return this[cacheKey] || null;
    },
    // 初始化所有常用元素
    init: function() {
        this.setupModal = document.getElementById('setup-modal');
        this.fixedTopBar = document.getElementById('fixed-top-bar');
        this.unlockModal = document.getElementById('unlock-modal');
        this.retryModal = document.getElementById('retry-modal');
        this.cardsContainer = document.getElementById('cards-container');
        this.headerDescription = document.getElementById('header-description');
        this.totalCountElement = document.getElementById('total-count');
        this.currentThemeName = document.getElementById('current-theme-name');
        this.testProgress = document.getElementById('test-progress');
        this.testInstruction = document.getElementById('test-instruction');
        this.themeList = document.getElementById('theme-list');
        this.progressCompleted = document.getElementById('progress-completed');
        this.progressLearning = document.getElementById('progress-learning');
        this.progressLocked = document.getElementById('progress-locked');
    },
    // 清除缓存（当DOM结构改变时调用）
    clear: function() {
        // 保留基本元素，清除可能变化的元素
        this.totalCountElement = null;
        this.currentThemeName = null;
    }
};

// 统一的modal显示/隐藏控制 - 使用缓存
function showModal(modalId) {
    // 尝试从缓存获取
    let modal = domCache[modalId.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())];
    if (!modal) {
        modal = domCache.get(modalId);
    }
    if (modal) {
        modal.classList.add('show');
        // 确保移除内联样式，让CSS类生效
        modal.style.display = '';
    }
}

function hideModal(modalId) {
    // 尝试从缓存获取
    let modal = domCache[modalId.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())];
    if (!modal) {
        modal = domCache.get(modalId);
    }
    if (modal) {
        modal.classList.remove('show');
        // 确保隐藏
        modal.style.display = 'none';
    }
}

// ==================== 配置管理函数 ====================

// 保存用户配置
function saveUserConfig() {
    const userType = document.querySelector('input[name="userType"]:checked').value;
    const ability = document.querySelector('input[name="ability"]:checked').value;
    
    userConfig.userType = userType;
    userConfig.ability = ability;
    userConfig.setupCompleted = true;
    
    // 异步保存，避免阻塞UI
    setTimeout(() => {
        try {
    localStorage.setItem('userConfig', JSON.stringify(userConfig));
        } catch (e) {
            error('保存用户配置失败:', e);
        }
    }, 0);
    
    // 初始化学习进度
    initializeLearningProgress();
    
    // 隐藏设置弹窗
    hideModal('setup-modal');
    
    // 显示主界面
    if (domCache.fixedTopBar) {
        domCache.fixedTopBar.style.display = 'flex';
    }
    
    // 更新界面
    updateHeaderDescription();
    updateTopBarProgress();
    updateCurrentThemeDisplay();
    loadCurrentTheme();
}

// 加载用户配置
function loadUserConfig() {
    try {
    const saved = localStorage.getItem('userConfig');
    if (saved) {
            try {
        userConfig = JSON.parse(saved);
                // 验证配置完整性
                if (!userConfig.userType || !userConfig.ability) {
                    warn('用户配置不完整，重置配置');
                    userConfig = {
                        userType: null,
                        ability: null,
                        setupCompleted: false
                    };
                    // 异步删除，避免阻塞
                    setTimeout(() => {
                        try {
                            localStorage.removeItem('userConfig');
                        } catch (e) {
                            error('删除用户配置失败:', e);
                        }
                    }, 0);
                }
            } catch (parseError) {
                error('解析用户配置失败:', parseError);
                userConfig = {
                    userType: null,
                    ability: null,
                    setupCompleted: false
                };
            }
        }
    } catch (e) {
        error('加载用户配置失败:', e);
        userConfig = {
            userType: null,
            ability: null,
            setupCompleted: false
        };
        // 异步删除，避免阻塞
        setTimeout(() => {
            try {
                localStorage.removeItem('userConfig');
            } catch (err) {
                error('删除用户配置失败:', err);
            }
        }, 0);
    }
}

// 初始化学习进度
function initializeLearningProgress() {
    const themes = themeOrder[userConfig.userType];
    const progress = {
        currentThemeIndex: 0,
        currentMode: 'learning',
        currentTestType: null,
        currentTheme: themes[0] || null,
        themes: {},
        carryOverMistakes: []
    };

    themes.forEach((theme, index) => {
        progress.themes[theme] = {
            status: index === 0 ? 'learning' : 'locked',
            test1: {
                status: index === 0 ? 'available' : 'locked',  // 第一个主题的test1可用
                passRate: null,
                attempts: 0,
                firstAttemptPassRate: null,
                lastAttempt: null
            },
            test2: {
                status: 'locked',
                passRate: null,
                attempts: 0,
                unlocked: false,
                unlockable: false,
                lastAttempt: null
            }
        };
    });

    learningProgress = progress;
    saveLearningProgress();
}

// 加载学习进度
function loadLearningProgress() {
    try {
    const saved = localStorage.getItem('learningProgress');
    if (saved) {
            try {
        learningProgress = JSON.parse(saved);
                
                // 验证学习进度完整性
                if (!learningProgress || typeof learningProgress !== 'object') {
                    warn('学习进度数据无效，将重新初始化');
                    learningProgress = null;
                    // 异步删除，避免阻塞
                    setTimeout(() => {
                        try {
                            localStorage.removeItem('learningProgress');
                        } catch (e) {
                            error('删除学习进度失败:', e);
                        }
                    }, 0);
                } else {
                    // 确保currentMode有默认值
                    if (!learningProgress.currentMode) {
                        learningProgress.currentMode = 'learning';
                    }
        
        // 确保数据兼容性：如果主题是learning状态，test1应该是available
                    if (learningProgress.themes && typeof learningProgress.themes === 'object') {
                        Object.keys(learningProgress.themes).forEach(theme => {
            const themeData = learningProgress.themes[theme];
                            if (themeData && themeData.status === 'learning' && themeData.test1 && themeData.test1.status === 'locked') {
                themeData.test1.status = 'available';
            }
        });
                    }
                    
                    if (!Array.isArray(learningProgress.carryOverMistakes)) {
                        learningProgress.carryOverMistakes = [];
                    }
                }
            } catch (parseError) {
                error('解析学习进度失败:', parseError);
                learningProgress = null;
            }
        }
    } catch (e) {
        error('加载学习进度失败:', e);
        learningProgress = null;
        // 异步删除，避免阻塞
        setTimeout(() => {
            try {
                localStorage.removeItem('learningProgress');
            } catch (err) {
                error('删除学习进度失败:', err);
            }
        }, 0);
    }
}

// 保存学习进度
function saveLearningProgress() {
    // 异步保存，避免阻塞UI
    setTimeout(() => {
        try {
    localStorage.setItem('learningProgress', JSON.stringify(learningProgress));
        } catch (e) {
            error('保存学习进度失败:', e);
        }
    }, 0);
}

// ==================== 界面更新函数 ====================

// 更新头部描述
function updateHeaderDescription() {
    if (!domCache.headerDescription) return;
    if (learningProgress.currentMode === 'learning') {
        domCache.headerDescription.textContent = '点击卡片正面查看中文+图片，背面查看德语+词性+发音';
    } else {
        domCache.headerDescription.textContent = '测试模式：选择正确答案';
    }
}

// 模式切换
function switchMode(mode) {
    learningProgress.currentMode = mode;
    saveLearningProgress();
    
    // 更新固定栏按钮状态
    document.querySelectorAll('.top-bar-mode-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`.top-bar-mode-btn[data-mode="${mode}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    // 更新原来的按钮状态（兼容）
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const oldActiveBtn = document.querySelector(`.mode-btn[data-mode="${mode}"]`);
    if (oldActiveBtn) {
        oldActiveBtn.classList.add('active');
    }
    
    updateHeaderDescription();
    
    // 确保固定顶部栏显示（特别是在移动端测试模式下）
    if (domCache.fixedTopBar) {
        domCache.fixedTopBar.style.display = 'flex';
    }
    
    // 使用缓存获取元素
    const testProgress = domCache.testProgress || domCache.get('test-progress');
    const testInstruction = domCache.testInstruction || domCache.get('test-instruction');
    
    if (mode === 'learning') {
        if (testProgress) {
            testProgress.style.display = 'none';
        }
        if (testInstruction) {
            testInstruction.style.display = 'none';
        }
        document.body.classList.remove('test-mode'); /* 移除测试模式类 */
        loadCurrentTheme();
    } else {
        if (testProgress) {
            testProgress.style.display = 'flex'; /* 改为flex */
        }
        document.body.classList.add('test-mode'); /* 添加测试模式类 */
        const nextTestType = learningProgress.currentTestType || 'test1';
        startTest(nextTestType);
    }
}

// 更新顶部栏进度统计
function updateTopBarProgress() {
    if (!userConfig.setupCompleted) return;
    
    const themes = themeOrder[userConfig.userType] || [];
    let completed = 0;
    let learning = 0;
    let locked = 0;
    
    themes.forEach(theme => {
        const themeData = learningProgress.themes[theme] || {};
        if (themeData.status === 'completed') {
            completed++;
        } else if (themeData.status === 'learning') {
            learning++;
        } else if (themeData.status === 'locked') {
            locked++;
        }
    });
    
    // 使用缓存获取元素
    const progressCompleted = domCache.progressCompleted || domCache.get('progress-completed');
    const progressLearning = domCache.progressLearning || domCache.get('progress-learning');
    const progressLocked = domCache.progressLocked || domCache.get('progress-locked');
    
    if (progressCompleted) progressCompleted.textContent = completed;
    if (progressLearning) progressLearning.textContent = learning;
    if (progressLocked) progressLocked.textContent = locked;
    
    // 更新当前主题显示
    updateCurrentThemeDisplay();
}

// 更新当前主题显示
function updateCurrentThemeDisplay() {
    const currentTheme = learningProgress.currentTheme;
    const themeNameElement = domCache.currentThemeName || domCache.get('current-theme-name');
    
    if (currentTheme && themeNameElement) {
        themeNameElement.textContent = currentTheme;
    } else if (themeNameElement) {
        themeNameElement.textContent = '-';
    }
}

// 词汇数据 - 根据图片文件名生成
const vocabulary = [
    // A1W01 时间和日期 30词
    { noun: "Wochenende", meaning: "周末", image: "Wochenende.jpg", category: "时间和日期", gender: "das" },
    { noun: "Woche", meaning: "周", image: "Woche.jpg", category: "时间和日期", gender: "die" },
    { noun: "Winter", meaning: "冬天", image: "Winter.jpg", category: "时间和日期", gender: "der" },
    { noun: "Vormittag", meaning: "上午", image: "Vormittag.jpg", category: "时间和日期", gender: "der" },
    { noun: "Urlaub", meaning: "度假", image: "Urlaub.jpg", category: "时间和日期", gender: "der" },
    { noun: "Tag", meaning: "天、白天", image: "Tag.png", category: "时间和日期", gender: "der" },
    { noun: "Sonntag", meaning: "周日", image: "Sonntag.jpg", category: "时间和日期", gender: "der" },
    { noun: "Sommer", meaning: "夏天", image: "Sommer.jpg", category: "时间和日期", gender: "der" },
    { noun: "Samstag", meaning: "周六", image: "Samstag.jpg", category: "时间和日期", gender: "der" },
    { noun: "Nacht", meaning: "夜", image: "Nacht.jpg", category: "时间和日期", gender: "die" },
    { noun: "Nachmittag", meaning: "下午", image: "Nachmittag.jpg", category: "时间和日期", gender: "der" },
    { noun: "März", meaning: "3月", image: "März.png", category: "时间和日期", gender: "der" },
    { noun: "Morgen", meaning: "早晨", image: "Morgen.jpg", category: "时间和日期", gender: "der" },
    { noun: "Montag", meaning: "周一", image: "Montag.jpg", category: "时间和日期", gender: "der" },
    { noun: "Monat", meaning: "月", image: "Monat.jpg", category: "时间和日期", gender: "der" },
    { noun: "Mittag", meaning: "中午", image: "Mittag.jpg", category: "时间和日期", gender: "der" },
    { noun: "Mai", meaning: "5月", image: "Mai.png", category: "时间和日期", gender: "der" },
    { noun: "Juni", meaning: "6月", image: "Juni.png", category: "时间和日期", gender: "der" },
    { noun: "Juli", meaning: "7月", image: "Juli.png", category: "时间和日期", gender: "der" },
    { noun: "Januar", meaning: "1月", image: "Januar.png", category: "时间和日期", gender: "der" },
    { noun: "Jahreszeiten", meaning: "季节", image: "Jahreszeiten.jpg", category: "时间和日期" }, // 复数
    { noun: "Jahr", meaning: "年", image: "Jahr.jpg", category: "时间和日期", gender: "das" },
    { noun: "Herbst", meaning: "秋天", image: "Herbst.jpg", category: "时间和日期", gender: "der" },
    { noun: "Frühling", meaning: "春天", image: "Frühling.jpg", category: "时间和日期", gender: "der" },
    { noun: "Feiertag", meaning: "节假日", image: "Feiertag.jpg", category: "时间和日期", gender: "der" },
    { noun: "Ende", meaning: "结束", image: "Ende.jpg", category: "时间和日期", gender: "das" },
    { noun: "Donnerstag", meaning: "周四", image: "Donnerstag.jpg", category: "时间和日期", gender: "der" },
    { noun: "Dezember", meaning: "12月", image: "Dezember.png", category: "时间和日期", gender: "der" },
    { noun: "Anfang", meaning: "开始", image: "Anfang.jpg", category: "时间和日期", gender: "der" },
    { noun: "Abend", meaning: "傍晚", image: "Abend.jpg", category: "时间和日期", gender: "der" },

    // A1W02 提问和交流 38词
    { noun: "Name", meaning: "名", image: "Name.jpg", category: "提问和交流", gender: "der" },
    { noun: "Verwandte", meaning: "亲戚", image: "Verwandte.jpg", category: "提问和交流" }, // 复数
    { noun: "Vater", meaning: "父亲", image: "Vater.jpg", category: "提问和交流", gender: "der" },
    { noun: "Tochter", meaning: "女儿", image: "Tochter.jpg", category: "提问和交流", gender: "die" },
    { noun: "Staatsangehörigkeit", meaning: "国籍", image: "Staatsangehörigkeit.jpg", category: "提问和交流", gender: "die" },
    { noun: "Sohn", meaning: "儿子", image: "Sohn.jpg", category: "提问和交流", gender: "der" },
    { noun: "Schwester", meaning: "姐妹", image: "Schwester.jpg", category: "提问和交流", gender: "die" },
    { noun: "Reisepass", meaning: "护照", image: "Reisepass.jpg", category: "提问和交流", gender: "der" },
    { noun: "Vorname", meaning: "姓名", image: "Vorname.jpg", category: "提问和交流", gender: "der" },
    { noun: "Nachname", meaning: "姓", image: "Nachname.jpg", category: "提问和交流", gender: "der" },
    { noun: "Mädchen", meaning: "女孩", image: "Mädchen.jpg", category: "提问和交流", gender: "das" },
    { noun: "Mutter", meaning: "母亲", image: "Mutter.jpg", category: "提问和交流", gender: "die" },
    { noun: "Mann", meaning: "男人", image: "Mann.jpg", category: "提问和交流", gender: "der" },
    { noun: "Kindergarten", meaning: "幼儿园", image: "Kindergarten.jpg", category: "提问和交流", gender: "der" },
    { noun: "Kind", meaning: "孩子", image: "Kind.jpg", category: "提问和交流", gender: "das" },
    { noun: "Junge", meaning: "男孩", image: "Junge.jpg", category: "提问和交流", gender: "der" },
    { noun: "Hochzeit", meaning: "婚礼", image: "Hochzeit.jpg", category: "提问和交流", gender: "die" },
    { noun: "Herr", meaning: "先生", image: "Herr.jpg", category: "提问和交流", gender: "der" },
    { noun: "Großvater", meaning: "（外）祖父", image: "Großvater.jpg", category: "提问和交流", gender: "der" },
    { noun: "Großmutter", meaning: "（外）祖母", image: "Großmutter.jpg", category: "提问和交流", gender: "die" },
    { noun: "Großeltern", meaning: "（外）祖父母", image: "Großeltern.jpg", category: "提问和交流" }, // 复数
    { noun: "Geschwister", meaning: "兄弟姐妹", image: "Geschwister.jpg", category: "提问和交流" }, // 复数
    { noun: "Geburtstag", meaning: "生日", image: "Geburtstag.jpg", category: "提问和交流", gender: "der" },
    { noun: "Geburtsdatum", meaning: "出生日期", image: "Geburtsdatum.jpg", category: "提问和交流", gender: "das" },
    { noun: "Freundin", meaning: "女朋友", image: "Freundin.jpg", category: "提问和交流", gender: "die" },
    { noun: "Freund", meaning: "朋友", image: "Freund.jpg", category: "提问和交流", gender: "der" },
    { noun: "Frau", meaning: "女士，女人", image: "Frau.jpg", category: "提问和交流", gender: "die" },
    { noun: "Formular", meaning: "表格", image: "Formular.jpg", category: "提问和交流", gender: "das" },
    { noun: "Familienstand", meaning: "婚姻状况", image: "Familienstand.jpg", category: "提问和交流", gender: "der" },
    { noun: "Familienname", meaning: "姓", image: "Familienname.jpg", category: "提问和交流", gender: "der" },
    { noun: "Familie", meaning: "家庭，家人", image: "Familie.jpg", category: "提问和交流", gender: "die" },
    { noun: "Erwachsene", meaning: "成人", image: "Erwachsene.jpg", category: "提问和交流" }, // 复数
    { noun: "Eltern", meaning: "父母", image: "Eltern.jpg", category: "提问和交流" }, // 复数
    { noun: "Ehemann", meaning: "丈夫", image: "Ehemann.jpg", category: "提问和交流", gender: "der" },
    { noun: "Ehefrau", meaning: "妻子", image: "Ehefrau.jpg", category: "提问和交流", gender: "die" },
    { noun: "Dame", meaning: "女士", image: "Dame.jpg", category: "提问和交流", gender: "die" },
    { noun: "Bruder", meaning: "兄弟", image: "Bruder.jpg", category: "提问和交流", gender: "der" },
    { noun: "Baby", meaning: "婴儿", image: "Baby.jpg", category: "提问和交流", gender: "das" },

    // A1W03 衣服 11词
    { noun: "Schuhe", meaning: "鞋子", image: "Schuhe.jpg", category: "衣服" }, // 复数
    { noun: "Rock", meaning: "短裙", image: "Rock.jpg", category: "衣服", gender: "der" },
    { noun: "Pullover", meaning: "毛衣", image: "Pullover.jpg", category: "衣服", gender: "der" },
    { noun: "Mantel", meaning: "长外套", image: "Mantel.jpg", category: "衣服", gender: "der" },
    { noun: "Kleidung", meaning: "衣服", image: "Kleidung.jpg", category: "衣服", gender: "die" },
    { noun: "Jeans", meaning: "牛仔裤", image: "Jeans.jpg", category: "衣服", gender: "die" },
    { noun: "Jacke", meaning: "夹克（短外套）", image: "Jacke.jpg", category: "衣服", gender: "die" },
    { noun: "Hose", meaning: "裤子", image: "Hose.jpg", category: "衣服", gender: "die" },
    { noun: "Hemd", meaning: "男衬衫", image: "Hemd.jpg", category: "衣服", gender: "das" },
    { noun: "Größe", meaning: "尺寸", image: "Größe.jpg", category: "衣服", gender: "die" },
    { noun: "Farbe", meaning: "颜色，颜料", image: "Farbe.jpg", category: "衣服", gender: "die" },

    // A1W04 食物 45词
    { noun: "Öl", meaning: "油", image: "Öl.jpg", category: "食物", gender: "das" },
    { noun: "Zitrone", meaning: "柠檬", image: "Zitrone.jpg", category: "食物", gender: "die" },
    { noun: "Wurst", meaning: "香肠", image: "Wurst.jpg", category: "食物", gender: "die" },
    { noun: "Wein", meaning: "葡萄酒、葡萄", image: "Wein.jpg", category: "食物", gender: "der" },
    { noun: "Wasser", meaning: "水", image: "Wasser.jpg", category: "食物", gender: "das" },
    { noun: "Tomate", meaning: "西红柿", image: "Tomate.jpg", category: "食物", gender: "die" },
    { noun: "Tee", meaning: "茶", image: "Tee.jpg", category: "食物", gender: "der" },
    { noun: "Suppe", meaning: "汤、羹", image: "Suppe.jpg", category: "食物", gender: "die" },
    { noun: "Speisekarte", meaning: "菜单", image: "Speisekarte.jpg", category: "食物", gender: "die" },
    { noun: "Schinken", meaning: "火腿", image: "Schinken.jpg", category: "食物", gender: "der" },
    { noun: "Salz", meaning: "盐", image: "Salz.jpg", category: "食物", gender: "das" },
    { noun: "Salat", meaning: "沙拉", image: "Salat.jpg", category: "食物", gender: "der" },
    { noun: "Saft", meaning: "果汁", image: "Saft.jpg", category: "食物", gender: "der" },
    { noun: "Restaurant", meaning: "餐馆", image: "Restaurant.jpg", category: "食物", gender: "das" },
    { noun: "Reis", meaning: "米饭", image: "Reis.jpg", category: "食物", gender: "der" },
    { noun: "Rechnung", meaning: "账单", image: "Rechnung.jpg", category: "食物", gender: "die" },
    { noun: "Pommes", meaning: "薯条", image: "Pommes.jpg", category: "食物" }, // 复数
    { noun: "Orange", meaning: "橙子，橙色", image: "Orange.jpg", category: "食物", gender: "die" },
    { noun: "Obst", meaning: "水果", image: "Obst.jpg", category: "食物", gender: "das" },
    { noun: "Nudeln", meaning: "面条", image: "Nudeln.jpg", category: "食物" }, // 复数
    { noun: "Mittagessen", meaning: "中餐", image: "Mittagessen.jpg", category: "食物", gender: "das" },
    { noun: "Milch", meaning: "牛奶", image: "Milch.png", category: "食物", gender: "die" },
    { noun: "Lebensmittel", meaning: "食物", image: "Lebensmittel.jpg", category: "食物", gender: "das" },
    { noun: "Küche", meaning: "厨房", image: "Küche.jpg", category: "食物", gender: "die" },
    { noun: "Käse", meaning: "奶酪", image: "Käse.jpg", category: "食物", gender: "der" },
    { noun: "Kuchen", meaning: "蛋糕", image: "Kuchen.jpg", category: "食物", gender: "der" },
    { noun: "Kartoffel", meaning: "土豆", image: "Kartoffel.jpg", category: "食物", gender: "die" },
    { noun: "Kaffee", meaning: "咖啡", image: "Kaffee.jpg", category: "食物", gender: "der" },
    { noun: "Hähnchen", meaning: "鸡肉，小鸡", image: "Hähnchen.jpg", category: "食物", gender: "das" },
    { noun: "Getränk", meaning: "饮料", image: "Getränk.jpg", category: "食物", gender: "das" },
    { noun: "Gemüse", meaning: "蔬菜", image: "Gemüse.jpg", category: "食物", gender: "das" },
    { noun: "Frühstück", meaning: "早餐", image: "Frühstück.jpg", category: "食物", gender: "das" },
    { noun: "Fleisch", meaning: "肉", image: "Fleisch.jpg", category: "食物", gender: "das" },
    { noun: "Fisch", meaning: "鱼", image: "Fisch.jpg", category: "食物", gender: "der" },
    { noun: "Eis", meaning: "冰、冰淇淋", image: "Eis.jpg", category: "食物", gender: "das" },
    { noun: "Ei", meaning: "蛋", image: "Ei.jpg", category: "食物", gender: "das" },
    { noun: "Café", meaning: "咖啡馆", image: "Café.jpg", category: "食物", gender: "das" },
    { noun: "Butter", meaning: "黄油", image: "Butter.jpg", category: "食物", gender: "die" },
    { noun: "Brötchen", meaning: "小面包", image: "Brötchen.jpg", category: "食物", gender: "das" },
    { noun: "Brot", meaning: "大面包（主食）", image: "Brot.jpg", category: "食物", gender: "das" },
    { noun: "Birne", meaning: "梨", image: "Birne.png", category: "食物", gender: "die" },
    { noun: "Bier", meaning: "啤酒", image: "Bier.jpg", category: "食物", gender: "das" },
    { noun: "Banane", meaning: "香蕉", image: "Banane.jpg", category: "食物", gender: "die" },
    { noun: "Apfel", meaning: "苹果", image: "Apfel.jpg", category: "食物", gender: "der" },
    { noun: "Abendessen", meaning: "晚餐", image: "Abendessen.jpg", category: "食物", gender: "das" },

    // A1W05 居住 50词
    { noun: "Zimmer", meaning: "房间", image: "Zimmer.jpg", category: "居住", gender: "das" },
    { noun: "Wohnzimmer", meaning: "客厅", image: "Wohnzimmer.jpg", category: "居住", gender: "das" },
    { noun: "Wohnung", meaning: "住宅", image: "Wohnung.jpg", category: "居住", gender: "die" },
    { noun: "Wohnadresse", meaning: "住址", image: "Wohnadresse.jpg", category: "居住", gender: "die" },
    { noun: "Wand", meaning: "墙", image: "Wand.jpg", category: "居住", gender: "die" },
    { noun: "Vermieter", meaning: "房东（出租）", image: "Vermieter.jpg", category: "居住", gender: "der" },
    { noun: "Uhr", meaning: "钟、点", image: "Uhr.jpg", category: "居住", gender: "die" },
    { noun: "Tür", meaning: "门", image: "Tür.jpg", category: "居住", gender: "die" },
    { noun: "Treppe", meaning: "楼梯", image: "Treppe.jpg", category: "居住", gender: "die" },
    { noun: "Toilette", meaning: "卫生间、马桶", image: "Toilette.jpg", category: "居住", gender: "die" },
    { noun: "Tisch", meaning: "桌子", image: "Tisch.png", category: "居住", gender: "der" },
    { noun: "Stuhl", meaning: "椅子", image: "Stuhl.png", category: "居住", gender: "der" },
    { noun: "Straße", meaning: "街道", image: "Straße.jpg", category: "居住", gender: "die" },
    { noun: "Stock", meaning: "楼层", image: "Stock.jpg", category: "居住", gender: "der" },
    { noun: "Stadt", meaning: "城市", image: "Stadt.jpg", category: "居住", gender: "die" },
    { noun: "Spiegel", meaning: "镜子", image: "Spiegel.png", category: "居住", gender: "der" },
    { noun: "Sofa", meaning: "沙发", image: "Sofa.jpg", category: "居住", gender: "das" },
    { noun: "Schrank", meaning: "柜子", image: "Schrank.jpg", category: "居住", gender: "der" },
    { noun: "Schlüssel", meaning: "钥匙", image: "Schlüssel.jpg", category: "居住", gender: "der" },
    { noun: "Schlafzimmer", meaning: "卧室", image: "Schlafzimmer.jpg", category: "居住", gender: "das" },
    { noun: "Raum", meaning: "房间、空间", image: "Raum.jpg", category: "居住", gender: "der" },
    { noun: "Postleitzahl", meaning: "邮编", image: "Postleitzahl.jpg", category: "居住", gender: "die" },
    { noun: "Platz", meaning: "广场、空地、位置", image: "Platz.jpg", category: "居住", gender: "der" },
    { noun: "Möbel", meaning: "家具", image: "Möbel.jpg", category: "居住" }, // 复数
    { noun: "Mieter", meaning: "租客", image: "Mieter.jpg", category: "居住", gender: "der" },
    { noun: "Miete", meaning: "租金", image: "Miete.jpg", category: "居住", gender: "die" },
    { noun: "Licht", meaning: "光", image: "Licht.jpg", category: "居住", gender: "das" },
    { noun: "Land", meaning: "土地、乡村、国家", image: "Land.jpg", category: "居住", gender: "das" },
    { noun: "Kühlschrank", meaning: "冰箱", image: "Kühlschrank.png", category: "居住", gender: "der" },
    { noun: "Küche", meaning: "厨房", image: "Küche.jpg", category: "居住", gender: "die" },
    { noun: "Kinderzimmer", meaning: "儿童房", image: "Kinderzimmer.jpg", category: "居住", gender: "das" },
    { noun: "Herd", meaning: "炉灶", image: "Herd.jpg", category: "居住", gender: "der" },
    { noun: "Hausnummer", meaning: "门牌号", image: "Hausnummer.jpg", category: "居住", gender: "die" },
    { noun: "Haus", meaning: "独栋房子、别墅", image: "Haus.jpg", category: "居住", gender: "das" },
    { noun: "Handtuch", meaning: "毛巾、手巾", image: "Handtuch.jpg", category: "居住", gender: "das" },
    { noun: "Garten", meaning: "花园", image: "Garten.jpg", category: "居住", gender: "der" },
    { noun: "Garage", meaning: "车库", image: "Garage.jpg", category: "居住", gender: "die" },
    { noun: "Fenster", meaning: "窗", image: "Fenster.jpg", category: "居住", gender: "das" },
    { noun: "Eingang", meaning: "入口", image: "Eingang.jpg", category: "居住", gender: "der" },
    { noun: "Dusche", meaning: "淋浴，淋浴间", image: "Dusche.jpg", category: "居住", gender: "die" },
    { noun: "Dorf", meaning: "小村庄", image: "Dorf.jpg", category: "居住", gender: "das" },
    { noun: "Bild", meaning: "画、图片", image: "Bild.jpg", category: "居住", gender: "das" },
    { noun: "Bett", meaning: "床", image: "Bett.jpg", category: "居住", gender: "das" },
    { noun: "Balkon", meaning: "阳台", image: "Balkon.jpg", category: "居住", gender: "der" },
    { noun: "Badezimmer", meaning: "浴室", image: "Badezimmer.jpg", category: "居住", gender: "das" },
    { noun: "Bad", meaning: "浴缸、浴室", image: "Bad.jpg", category: "居住", gender: "das" },
    { noun: "Ausgang", meaning: "出口", image: "Ausgang.jpg", category: "居住", gender: "der" },
    { noun: "Aufzug", meaning: "直升电梯", image: "Aufzug.jpg", category: "居住", gender: "der" },
    { noun: "Apartment", meaning: "公寓", image: "Apartment.jpg", category: "居住", gender: "das" },
    { noun: "Adresse", meaning: "地址", image: "Adresse.jpg", category: "居住", gender: "die" },

    // A1W06 交通和旅行 42词
    { noun: "Zug", meaning: "火车", image: "Zug.jpg", category: "交通和旅行", gender: "der" },
    { noun: "Vollpension", meaning: "全包食宿（住宿+2主餐）", image: "Vollpension.jpg", category: "交通和旅行", gender: "die" },
    { noun: "Unfall", meaning: "事故", image: "Unfall.jpg", category: "交通和旅行", gender: "der" },
    { noun: "U-Bahn", meaning: "地铁", image: "U-Bahn.jpg", category: "交通和旅行", gender: "die" },
    { noun: "Tourist", meaning: "旅游、游客", image: "Tourist.jpg", category: "交通和旅行", gender: "der" },
    { noun: "Taxi", meaning: "出租车", image: "Taxi.jpg", category: "交通和旅行", gender: "das" },
    { noun: "Tasche", meaning: "手提袋、袋子", image: "Tasche.jpg", category: "交通和旅行", gender: "die" },
    { noun: "Straßenbahn", meaning: "有轨电车", image: "Straßenbahn.jpg", category: "交通和旅行", gender: "die" },
    { noun: "Stadtplan", meaning: "城市地图", image: "Stadtplan.jpg", category: "交通和旅行", gender: "der" },
    { noun: "Sehenswürdigkeit", meaning: "景点、名胜古迹", image: "Sehenswürdigkeit.jpg", category: "交通和旅行", gender: "die" },
    { noun: "Schiff", meaning: "轮船", image: "Schiff.jpg", category: "交通和旅行", gender: "das" },
    { noun: "S-Bahn", meaning: "轻轨", image: "S-Bahn.jpg", category: "交通和旅行", gender: "die" },
    { noun: "Rezeption", meaning: "前台", image: "Rezeption.jpg", category: "交通和旅行", gender: "die" },
    { noun: "Reiseführer", meaning: "导游、导游手册", image: "Reiseführer.jpg", category: "交通和旅行", gender: "der" },
    { noun: "Reisebüro", meaning: "旅行社", image: "Reisebüro.jpg", category: "交通和旅行", gender: "das" },
    { noun: "Reise", meaning: "旅行", image: "Reise.jpg", category: "交通和旅行", gender: "die" },
    { noun: "Polizei", meaning: "警察", image: "Polizei.jpg", category: "交通和旅行", gender: "die" },
    { noun: "Linie", meaning: "线路", image: "Linie.jpg", category: "交通和旅行", gender: "die" },
    { noun: "Koffer", meaning: "行李箱", image: "Koffer.jpg", category: "交通和旅行", gender: "der" },
    { noun: "Information", meaning: "信息，信息问询处", image: "Information.jpg", category: "交通和旅行", gender: "die" },
    { noun: "Hotel", meaning: "酒店", image: "Hotel.jpg", category: "交通和旅行", gender: "das" },
    { noun: "Haltestelle", meaning: "停靠站", image: "Haltestelle.jpg", category: "交通和旅行", gender: "die" },
    { noun: "Halbpension", meaning: "半包食宿（住+1主餐）", image: "Halbpension.jpg", category: "交通和旅行", gender: "die" },
    { noun: "Gepäck", meaning: "行李", image: "Gepäck.jpg", category: "交通和旅行", gender: "das" },
    { noun: "Gast", meaning: "客人", image: "Gast.jpg", category: "交通和旅行", gender: "der" },
    { noun: "Führerschein", meaning: "驾照", image: "Führerschein.jpg", category: "交通和旅行", gender: "der" },
    { noun: "Flugzeug", meaning: "飞机", image: "Flugzeug.jpg", category: "交通和旅行", gender: "das" },
    { noun: "Flughafen", meaning: "机场", image: "Flughafen.jpg", category: "交通和旅行", gender: "der" },
    { noun: "Fahrplan", meaning: "行程", image: "Fahrplan.jpg", category: "交通和旅行", gender: "der" },
    { noun: "Fahrrad", meaning: "自行车", image: "Fahrrad.jpg", category: "交通和旅行", gender: "das" },
    { noun: "Fahrkarte", meaning: "车票", image: "Fahrkarte.jpg", category: "交通和旅行", gender: "die" },
    { noun: "Ecke", meaning: "角落", image: "Ecke.jpg", category: "交通和旅行", gender: "die" },
    { noun: "Durchsage", meaning: "通知广播", image: "Durchsage.jpg", category: "交通和旅行", gender: "die" },
    { noun: "Bus", meaning: "公交", image: "Bus.jpg", category: "交通和旅行", gender: "der" },
    { noun: "Besuch", meaning: "拜访", image: "Besuch.jpg", category: "交通和旅行", gender: "der" },
    { noun: "Bahnhof", meaning: "火车站", image: "Bahnhof.jpg", category: "交通和旅行", gender: "der" },
    { noun: "Autobahn", meaning: "高速公路", image: "Autobahn.jpg", category: "交通和旅行", gender: "die" },
    { noun: "Auto", meaning: "小汽车", image: "Auto.jpg", category: "交通和旅行", gender: "das" },
    { noun: "Ausflug", meaning: "郊游、出游", image: "Ausflug.jpg", category: "交通和旅行", gender: "der" },
    { noun: "Ankunft", meaning: "抵达", image: "Ankunft.jpg", category: "交通和旅行", gender: "die" },
    { noun: "Abflug", meaning: "起飞", image: "Abflug.jpg", category: "交通和旅行", gender: "der" },
    { noun: "Abfahrt", meaning: "启程出发", image: "Abfahrt.jpg", category: "交通和旅行", gender: "die" },

    // A1W07 购物 19词
    { noun: "Verkäuferin", meaning: "售货员（女）", image: "Verkäuferin.jpg", category: "购物", gender: "die" },
    { noun: "Verkauf", meaning: "卖", image: "Verkauf.jpg", category: "购物", gender: "der" },
    { noun: "Supermarkt", meaning: "超市", image: "Supermarket.jpg", category: "购物", gender: "der" },
    { noun: "Preis", meaning: "价格", image: "Preis.jpg", category: "购物", gender: "der" },
    { noun: "Laden", meaning: "商店（小）", image: "Laden.jpg", category: "购物", gender: "der" },
    { noun: "Kundinnen", meaning: "女客户们", image: "Kundinnen.jpg", category: "购物" }, // 复数
    { noun: "Kunde", meaning: "客户", image: "Kunde.jpg", category: "购物", gender: "der" },
    { noun: "Kiosk", meaning: "书报亭", image: "Kiosk.jpg", category: "购物", gender: "der" },
    { noun: "Kilogramm", meaning: "千克", image: "Kilo.jpg", category: "购物", gender: "das" },
    { noun: "Kaufhaus", meaning: "商场", image: "Kaufhaus.jpg", category: "购物", gender: "das" },
    { noun: "Kasse", meaning: "收银台", image: "Kasse.jpg", category: "购物", gender: "die" },
    { noun: "Gewicht", meaning: "重量", image: "Gewicht.jpg", category: "购物", gender: "das" },
    { noun: "Geschäft", meaning: "商店、生意", image: "Geschäft.jpg", category: "购物", gender: "das" },
    { noun: "Geld", meaning: "钱", image: "Geld.jpg", category: "购物", gender: "das" },
    { noun: "Euro", meaning: "欧元", image: "Euro.jpg", category: "购物", gender: "der" },
    { noun: "Einkauf", meaning: "采购", image: "Einkauf.jpg", category: "购物", gender: "der" },
    { noun: "Bäckerei", meaning: "面包店、烘焙坊", image: "Bäckerei.jpg", category: "购物", gender: "die" },
    { noun: "Bestellung", meaning: "订单、订购", image: "Bestellung.jpg", category: "购物", gender: "die" },
    { noun: "Angebot", meaning: "（提供的）商品、报价", image: "Angebot.jpg", category: "购物", gender: "das" },

    // A1W08 看医生 19词
    { noun: "Ohr", meaning: "耳朵", image: "Ohr.jpg", category: "看医生", gender: "das" },
    { noun: "Zahnärztin", meaning: "牙医（女）", image: "Zahnärztin.jpg", category: "看医生", gender: "die" },
    { noun: "Zahn", meaning: "牙齿", image: "Zahn.png", category: "看医生", gender: "der" },
    { noun: "Termin", meaning: "预约（时间）", image: "Termin.jpg", category: "看医生", gender: "der" },
    { noun: "Praxis", meaning: "诊所", image: "Praxis.jpg", category: "看医生", gender: "die" },
    { noun: "Nase", meaning: "鼻子", image: "Nase.jpg", category: "看医生", gender: "die" },
    { noun: "Mund", meaning: "嘴", image: "Mund.jpg", category: "看医生", gender: "der" },
    { noun: "Medikament", meaning: "药品", image: "Medikament.jpg", category: "看医生", gender: "das" },
    { noun: "Kopf", meaning: "头", image: "Kopf.jpg", category: "看医生", gender: "der" },
    { noun: "Hand", meaning: "手", image: "Hand.png", category: "看医生", gender: "die" },
    { noun: "Haar", meaning: "头发", image: "Haar.jpg", category: "看医生", gender: "das" },
    { noun: "Fuß", meaning: "足", image: "Fuß.png", category: "看医生", gender: "der" },
    { noun: "Doktor", meaning: "医生、博士", image: "Doktor.jpg", category: "看医生", gender: "der" },
    { noun: "Bein", meaning: "腿", image: "Bein.png", category: "看医生", gender: "das" },
    { noun: "Bauch", meaning: "肚子", image: "Bauch.jpg", category: "看医生", gender: "der" },
    { noun: "Auge", meaning: "眼睛", image: "Auge.jpg", category: "看医生", gender: "das" },
    { noun: "Arzt", meaning: "医生", image: "Arzt.jpg", category: "看医生", gender: "der" },
    { noun: "Arm", meaning: "手臂", image: "Arm.jpg", category: "看医生", gender: "der" },
    { noun: "Apotheke", meaning: "药店", image: "Apotheke.jpg", category: "看医生", gender: "die" },

    // A1W09 银行和邮局 22词
    { noun: "Überweisung", meaning: "转账汇款", image: "Überweisung.jpg", category: "银行和邮局", gender: "die" },
    { noun: "Unterschrift", meaning: "签名", image: "Unterschrift.jpg", category: "银行和邮局", gender: "die" },
    { noun: "Telefonnummer", meaning: "电话号码", image: "Telefonnummer.jpg", category: "银行和邮局", gender: "die" },
    { noun: "Telefonbuch", meaning: "电话薄", image: "Telefonbuch.jpg", category: "银行和邮局", gender: "das" },
    { noun: "Telefon", meaning: "电话", image: "Telefon.jpg", category: "银行和邮局", gender: "das" },
    { noun: "Schalter", meaning: "柜台、开合式的开关", image: "Schalter.jpg", category: "银行和邮局", gender: "der" },
    { noun: "Postkarte", meaning: "明星片", image: "Postkarte.jpg", category: "银行和邮局", gender: "die" },
    { noun: "Post", meaning: "邮局、邮政", image: "Post.jpg", category: "银行和邮局", gender: "die" },
    { noun: "Kreditkarte", meaning: "信用卡", image: "Kreditkarte.jpg", category: "银行和邮局", gender: "die" },
    { noun: "Konto", meaning: "账户", image: "Konto.jpg", category: "银行和邮局", gender: "das" },
    { noun: "Handy", meaning: "手机", image: "Handy.jpg", category: "银行和邮局", gender: "das" },
    { noun: "Geldautomat", meaning: "ATM（银行）", image: "Geldautomat.jpg", category: "银行和邮局", gender: "der" },
    { noun: "Fax", meaning: "传真", image: "Fax.jpg", category: "银行和邮局", gender: "das" },
    { noun: "Empfänger", meaning: "收件人", image: "Empfänger.jpg", category: "银行和邮局", gender: "der" },
    { noun: "Briefmarke", meaning: "邮票", image: "Briefmarke.jpg", category: "银行和邮局", gender: "die" },
    { noun: "Brief", meaning: "信", image: "Brief.jpg", category: "银行和邮局", gender: "der" },
    { noun: "Bank", meaning: "银行", image: "Bank.jpg", category: "银行和邮局", gender: "die" },
    { noun: "Automat", meaning: "自动机（车票、饮料、银行ATM等）", image: "Automat.jpg", category: "银行和邮局", gender: "der" },
    { noun: "Ausweis", meaning: "身份证件", image: "Ausweis.jpg", category: "银行和邮局", gender: "der" },
    { noun: "Anrufbeantworter", meaning: "电话答录机", image: "Anrufbeantworter.jpg", category: "银行和邮局", gender: "der" },
    { noun: "Anruf", meaning: "打电话", image: "Anruf.jpg", category: "银行和邮局", gender: "der" },
    { noun: "Absender", meaning: "寄件人", image: "Absender.jpg", category: "银行和邮局", gender: "der" },

    // A1W10 学习和工作 36词
    { noun: "Wort", meaning: "单词", image: "Wort.jpg", category: "学习和工作", gender: "das" },
    { noun: "Kurs", meaning: "课程", image: "Kurs.jpg", category: "学习和工作", gender: "der" },
    { noun: "Position", meaning: "位置", image: "Stelle.jpg", category: "学习和工作", gender: "die" },
    { noun: "Schülerin", meaning: "中小学生（女）", image: "Schülerin.jpg", category: "学习和工作", gender: "die" },
    { noun: "Schüler", meaning: "中小学生", image: "Schüler.jpg", category: "学习和工作", gender: "der" },
    { noun: "Schule", meaning: "学校", image: "Schule.jpg", category: "学习和工作", gender: "die" },
    { noun: "Schreibtisch", meaning: "书桌", image: "Schreibtisch.jpg", category: "学习和工作", gender: "der" },
    { noun: "Satz", meaning: "句子", image: "Satz.jpg", category: "学习和工作", gender: "der" },
    { noun: "Prüfung", meaning: "考试", image: "Prüfung.jpg", category: "学习和工作", gender: "die" },
    { noun: "Praktikum", meaning: "实习", image: "Praktikum.jpg", category: "学习和工作", gender: "das" },
    { noun: "Pause", meaning: "暂停、中间休息", image: "Pause.jpg", category: "学习和工作", gender: "die" },
    { noun: "Papier", meaning: "纸", image: "Papier.jpg", category: "学习和工作", gender: "das" },
    { noun: "Antwort", meaning: "答案", image: "Lösung.png", category: "学习和工作", gender: "die" },
    { noun: "Lehrerin", meaning: "老师（女）", image: "Lehrerin.jpg", category: "学习和工作", gender: "die" },
    { noun: "Lehrer", meaning: "老师", image: "Lehrer.jpg", category: "学习和工作", gender: "der" },
    { noun: "Kurs", meaning: "培训课程，路线、汇率", image: "Kurs.jpg", category: "学习和工作", gender: "der" },
    { noun: "Kugelschreiber", meaning: "圆珠笔", image: "Kugelschreiber.jpg", category: "学习和工作", gender: "der" },
    { noun: "Kollegin", meaning: "同事（女）", image: "Kollegin.jpg", category: "学习和工作", gender: "die" },
    { noun: "Kollege", meaning: "同事", image: "Kollege.jpg", category: "学习和工作", gender: "der" },
    { noun: "Klasse", meaning: "年级、等级", image: "Klasse.jpg", category: "学习和工作", gender: "die" },
    { noun: "Job", meaning: "工作（临时）", image: "Job.jpg", category: "学习和工作", gender: "der" },
    { noun: "Hausaufgabe", meaning: "家庭作业", image: "Hausaufgabe.jpg", category: "学习和工作", gender: "die" },
    { noun: "Firma", meaning: "公司", image: "Firma.jpg", category: "学习和工作", gender: "die" },
    { noun: "Fehler", meaning: "错误", image: "Fehler.jpg", category: "学习和工作", gender: "der" },
    { noun: "Drucker", meaning: "打印机", image: "Drucker.png", category: "学习和工作", gender: "der" },
    { noun: "Computer", meaning: "电脑", image: "Computer.jpg", category: "学习和工作", gender: "der" },
    { noun: "Chefin", meaning: "老板（女）", image: "Chefin.jpg", category: "学习和工作", gender: "die" },
    { noun: "Chef", meaning: "老板", image: "Chef.jpg", category: "学习和工作", gender: "der" },
    { noun: "Büro", meaning: "办公室", image: "Büro.jpg", category: "学习和工作", gender: "das" },
    { noun: "Buchstabe", meaning: "字母", image: "Buchstabe.jpg", category: "学习和工作", gender: "der" },
    { noun: "Bleistift", meaning: "铅笔", image: "Bleistift.png", category: "学习和工作", gender: "der" },
    { noun: "Beruf", meaning: "职业", image: "Beruf.jpg", category: "学习和工作", gender: "der" },
    { noun: "Berufsausbildung", meaning: "职业培训", image: "Ausbildung.jpg", category: "学习和工作", gender: "die" },
    { noun: "Arbeitsplatz", meaning: "工作岗位", image: "Arbeitsplatz.jpg", category: "学习和工作", gender: "der" },
    { noun: "Arbeiter", meaning: "工作者", image: "Arbeiter.jpg", category: "学习和工作", gender: "der" },
    { noun: "Arbeit", meaning: "工作", image: "Arbeit.jpg", category: "学习和工作", gender: "die" },

    // A1W11 业余活动 33词
    { noun: "Zeitung", meaning: "报纸", image: "Zeitung.jpg", category: "业余活动", gender: "die" },
    { noun: "Wind", meaning: "风", image: "Wind.jpg", category: "业余活动", gender: "der" },
    { noun: "Wetter", meaning: "天气", image: "Wetter.jpg", category: "业余活动", gender: "das" },
    { noun: "Verein", meaning: "协会、俱乐部", image: "Verein.jpg", category: "业余活动", gender: "der" },
    { noun: "Urlaub", meaning: "假期", image: "Urlaub.jpg", category: "业余活动", gender: "der" },
    { noun: "Ticket", meaning: "票", image: "Ticket.jpg", category: "业余活动", gender: "das" },
    { noun: "Sportverein", meaning: "体育协会", image: "Sportverein.jpg", category: "业余活动", gender: "der" },
    { noun: "Sport", meaning: "运动", image: "Sport.jpg", category: "业余活动", gender: "der" },
    { noun: "Spaziergang", meaning: "散步", image: "Spaziergang.jpg", category: "业余活动", gender: "der" },
    { noun: "Sonne", meaning: "太阳", image: "Sonne.jpg", category: "业余活动", gender: "die" },
    { noun: "See", meaning: "湖", image: "See.jpg", category: "业余活动", gender: "der" },
    { noun: "Schwimmbad", meaning: "游泳池", image: "Schwimmbad.jpg", category: "业余活动", gender: "das" },
    { noun: "Regen", meaning: "雨", image: "Regen.jpg", category: "业余活动", gender: "der" },
    { noun: "Musik", meaning: "音乐", image: "Musik.jpg", category: "业余活动", gender: "die" },
    { noun: "Museum", meaning: "博物馆", image: "Museum.jpg", category: "业余活动", gender: "das" },
    { noun: "Meer", meaning: "海", image: "Meer.jpg", category: "业余活动", gender: "das" },
    { noun: "Kino", meaning: "电影院", image: "Kino.jpg", category: "业余活动", gender: "das" },
    { noun: "Karte", meaning: "卡片、地图", image: "Karte.jpg", category: "业余活动", gender: "die" },
    { noun: "Internet", meaning: "互联网", image: "Internet.jpg", category: "业余活动", gender: "das" },
    { noun: "Hobby", meaning: "爱好", image: "Hobby.jpg", category: "业余活动", gender: "das" },
    { noun: "Geschenk", meaning: "礼物", image: "Geschenk.jpg", category: "业余活动", gender: "das" },
    { noun: "Fußball", meaning: "足球", image: "Fußball.jpg", category: "业余活动", gender: "der" },
    { noun: "Freizeit", meaning: "空闲时间", image: "Freizeit.jpg", category: "业余活动", gender: "die" },
    { noun: "Film", meaning: "电影", image: "Film.jpg", category: "业余活动", gender: "der" },
    { noun: "Fest", meaning: "节日、庆祝", image: "Fest.jpg", category: "业余活动", gender: "das" },
    { noun: "Ferien", meaning: "假期", image: "Ferien.jpg", category: "业余活动" }, // 复数
    { noun: "Eintrittskarte", meaning: "入场券", image: "Eintrittskarte.jpg", category: "业余活动", gender: "die" },
    { noun: "Einladung", meaning: "邀请", image: "Einladung.jpg", category: "业余活动", gender: "die" },
    { noun: "Disco", meaning: "迪斯科", image: "Disco.jpg", category: "业余活动", gender: "die" },
    { noun: "CD", meaning: "CD光盘", image: "CD.jpg", category: "业余活动", gender: "die" },
    { noun: "Buch", meaning: "书", image: "Buch.jpg", category: "业余活动", gender: "das" },
    { noun: "Anmeldung", meaning: "报名、登记", image: "Anmeldung.jpg", category: "业余活动", gender: "die" },

    // A1W12 文具 15词（青少年）
    { noun: "Uhr", meaning: "钟表", image: "Uhr.jpg", category: "文具", gender: "die" },
    { noun: "Spitzer", meaning: "卷笔刀", image: "Spitzer.png", category: "文具", gender: "der" },
    { noun: "Schere", meaning: "剪刀", image: "Schere.jpg", category: "文具", gender: "die" },
    { noun: "Rucksack", meaning: "背包", image: "Rucksack.jpg", category: "文具", gender: "der" },
    { noun: "Radiergummi", meaning: "橡皮", image: "Radiergummi.png", category: "文具", gender: "der" },
    { noun: "Mäppchen", meaning: "笔袋", image: "Mäppchen.jpg", category: "文具", gender: "das" },
    { noun: "Lineal", meaning: "尺子", image: "Lineal.png", category: "文具", gender: "das" },
    { noun: "Kugelschreiber", meaning: "圆珠笔", image: "Kugelschreiber.png", category: "文具", gender: "der" },
    { noun: "Klebstoff", meaning: "胶水", image: "Klebstoff.png", category: "文具", gender: "der" },
    { noun: "Heft", meaning: "练习本", image: "Heft.jpg", category: "文具", gender: "das" },
    { noun: "Füller", meaning: "钢笔", image: "Füller.jpg", category: "文具", gender: "der" },
    { noun: "Filzstift", meaning: "马克笔", image: "Filzstift.jpg", category: "文具", gender: "der" },
    { noun: "Buch", meaning: "书", image: "Buch.jpg", category: "文具", gender: "das" },
    { noun: "Brille", meaning: "眼镜", image: "Brille.png", category: "文具", gender: "die" },
    { noun: "Bleistift", meaning: "铅笔", image: "Bleistift.jpg", category: "文具", gender: "der" },

    // A1W13 动物 11词（青少年）
    { noun: "Vogel", meaning: "鸟", image: "Vogel.jpg", category: "动物", gender: "der" },
    { noun: "Tiger", meaning: "老虎", image: "Tiger.jpg", category: "动物", gender: "der" },
    { noun: "Pinguin", meaning: "企鹅", image: "Pinguin.jpg", category: "动物", gender: "der" },
    { noun: "Pferd", meaning: "马", image: "Pferd.jpg", category: "动物", gender: "das" },
    { noun: "Papagei", meaning: "鹦鹉", image: "Papagei.jpg", category: "动物", gender: "der" },
    { noun: "Maus", meaning: "老鼠", image: "Maus.jpg", category: "动物", gender: "die" },
    { noun: "Löwe", meaning: "狮子", image: "Löwe.jpg", category: "动物", gender: "der" },
    { noun: "Katze", meaning: "猫", image: "Katze.jpg", category: "动物", gender: "die" },
    { noun: "Kaninchen", meaning: "兔子", image: "Kaninchen.jpg", category: "动物", gender: "das" },
    { noun: "Hund", meaning: "狗", image: "Hund.jpg", category: "动物", gender: "der" },
    { noun: "Haustier", meaning: "宠物", image: "Haustier.jpg", category: "动物", gender: "das" },
    { noun: "Hase", meaning: "野兔", image: "Hase.jpg", category: "动物", gender: "der" }
];

// 获取类别名称
function getCategoryName(category) {
    const names = {
        'all': '全部词汇 (随机排序)',
        '时间和日期': '时间和日期',
        '提问和交流': '提问和交流',
        '衣服': '衣服',
        '食物': '食物',
        '居住': '居住',
        '交通和旅行': '交通和旅行',
        '购物': '购物',
        '看医生': '看医生',
        '银行和邮局': '银行和邮局',
        '学习和工作': '学习和工作',
        '业余活动': '业余活动',
        '文具': '文具',
        '动物': '动物'
    };
    return names[category] || '词汇';
}

// 音效功能 - 答对音效（高音调，愉快的音调）
function playCorrectSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // 创建三个音调（C-E-G和弦）
        const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5
        const startTimes = [0, 0.1, 0.2];
        
        frequencies.forEach((freq, index) => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.value = freq;
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            const startTime = audioContext.currentTime + startTimes[index];
            const duration = 0.2;
            
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
            
            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        });
    } catch (e) {
        // 音效播放失败，静默处理
    }
}

// 音效功能 - 答错音效（低音调，低沉的音调）
function playIncorrectSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sawtooth'; // 使用锯齿波，听起来更低沉
        oscillator.frequency.value = 220; // A3
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        const startTime = audioContext.currentTime;
        const duration = 0.3;
        
        // 频率下降
        oscillator.frequency.setValueAtTime(220, startTime);
        oscillator.frequency.exponentialRampToValueAtTime(150, startTime + duration);
        
        // 音量控制
        gainNode.gain.setValueAtTime(0.3, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
    } catch (e) {
        // 音效播放失败，静默处理
    }
}

// 发音功能 - 朗读单词
function speakWord(word, event) {
    if (event) {
        event.stopPropagation();
    }
    
    if ('speechSynthesis' in window) {
        // 停止当前正在播放的语音
        window.speechSynthesis.cancel();
        
        // 获取可用的德语语音
        const voices = window.speechSynthesis.getVoices();
        const germanVoice = voices.find(voice => 
            voice.lang.startsWith('de') && 
            (voice.name.includes('German') || voice.name.includes('Deutsch') || voice.lang === 'de-DE')
        );
        
        // 创建单词朗读
        const wordUtterance = new SpeechSynthesisUtterance(word);
        wordUtterance.lang = 'de-DE';
        wordUtterance.rate = 0.9;
        wordUtterance.pitch = 1;
        if (germanVoice) {
            wordUtterance.voice = germanVoice;
        }
        
        // 播放单词朗读
        window.speechSynthesis.speak(wordUtterance);
        
        // 添加动画效果
        if (event) {
            const button = event.target.closest('.speak-btn');
            if (button) {
                button.innerHTML = '<span class="icon">🔊</span>';
                setTimeout(() => {
                    button.innerHTML = '<span class="icon">🔊</span>';
                }, 1000);
            }
        }
    } else {
        alert('抱歉，您的浏览器不支持语音合成功能。');
    }
}

// 发音功能 - 朗读单词和中文释义（用于点击卡片时自动朗读）
function speakWordAndMeaning(word, meaning) {
    if ('speechSynthesis' in window) {
        // 停止当前正在播放的语音
        window.speechSynthesis.cancel();
        
        // 获取可用的语音
        const voices = window.speechSynthesis.getVoices();
        const germanVoice = voices.find(voice => 
            voice.lang.startsWith('de') && 
            (voice.name.includes('German') || voice.name.includes('Deutsch') || voice.lang.startsWith('de-'))
        );
        const chineseVoice = voices.find(voice => 
            voice.lang.startsWith('zh') && 
            (voice.name.includes('Chinese') || voice.name.includes('中文') || voice.lang.startsWith('zh-'))
        );
        
        // 创建单词朗读
        const wordUtterance = new SpeechSynthesisUtterance(word);
        wordUtterance.lang = 'de-DE';
        wordUtterance.rate = 0.9;
        wordUtterance.pitch = 1;
        if (germanVoice) {
            wordUtterance.voice = germanVoice;
        }
        
        // 单词朗读完成后朗读中文释义
        wordUtterance.onend = function() {
            setTimeout(() => {
                const meaningUtterance = new SpeechSynthesisUtterance(meaning);
                meaningUtterance.lang = 'zh-CN';
                meaningUtterance.rate = 1;
                meaningUtterance.pitch = 1;
                if (chineseVoice) {
                    meaningUtterance.voice = chineseVoice;
                }
                window.speechSynthesis.speak(meaningUtterance);
            }, 300); // 短暂间隔
        };
        
        // 播放单词朗读
        window.speechSynthesis.speak(wordUtterance);
    }
}

// 识别复数词汇
function isPluralNoun(noun) {
    // 常见的德语复数词汇（只有复数形式或常用复数形式）
    const pluralNouns = [
        'Schuhe', 'Eltern', 'Geschwister', 'Großeltern', 
        'Nudeln', 'Pommes', 'Ferien', 'Möbel', 'Verwandte',
        'Erwachsene', 'Kundinnen', 'Jahreszeiten'
    ];
    
    // 检查是否在复数列表中
    return pluralNouns.includes(noun);
}

// 获取词性标识信息
function getGenderInfo(gender, noun) {
    // 如果是复数，返回复数标识
    if (isPluralNoun(noun)) {
        return { class: 'plural', text: 'die' };
    }
    
    if (!gender) return null;
    
    const genderMap = {
        'der': { class: 'masculine', text: 'der' },
        'das': { class: 'neuter', text: 'das' },
        'die': { class: 'feminine', text: 'die' }
    };
    
    return genderMap[gender.toLowerCase()] || null;
}

// 图片路径解析函数 - 支持多种路径查找方式
function getImagePath(imageName, category) {
    const folderName = CATEGORY_FOLDERS[category];
    
    if (!folderName) {
        warn(`未找到类别 "${category}" 对应的文件夹，使用默认路径`);
        return imageName;
    }
    
    // 使用正斜杠构建路径（浏览器会自动处理）
    // 在HTTP服务器环境下，直接使用相对路径即可
    const path = `${folderName}/${imageName}`;
    
    // 调试信息（仅在开发时使用）
    log(`图片路径 [${category}]: ${path}`);
    
    return path;
}

// 图片加载错误处理
function handleImageError(imgElement, imageName, category) {
    const folderName = CATEGORY_FOLDERS[category];
    
    // 尝试备用路径（按优先级排序）
    const fallbackPaths = [];
    
    // 1. 尝试未编码的路径（最常用，浏览器通常能正确处理）
    if (folderName) {
        fallbackPaths.push(`${folderName}/${imageName}`);
    }
    
    // 2. 尝试编码的路径（如果路径包含特殊字符）
    if (folderName) {
        const needsEncoding = /[^\w\-_.\/]/.test(folderName) || /[^\w\-_.]/.test(imageName);
        if (needsEncoding) {
            const encodedPath = folderName.split('/').map(segment => {
                return /[^\w\-_.]/.test(segment) ? encodeURIComponent(segment) : segment;
            }).join('/') + '/' + (/[^\w\-_.]/.test(imageName) ? encodeURIComponent(imageName) : imageName);
            fallbackPaths.push(encodedPath);
        }
    }
    
    // 3. 尝试直接使用文件名（如果图片在同一目录）
    fallbackPaths.push(imageName);
    
    // 4. 尝试备用文件夹（如果存在）
    if (folderName) {
        const backupPath = `新建文件夹/带水印 40质量 - 带中文解释/${folderName}/${imageName}`;
        fallbackPaths.push(backupPath);
    }
    
    let currentTry = 0;
    const maxTries = fallbackPaths.length;
    
    // 创建美观的占位符SVG
    const createPlaceholderSVG = (text) => {
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 200 200">
                <rect width="200" height="200" fill="#f5f5f5" stroke="#ddd" stroke-width="2"/>
                <text x="100" y="80" font-family="Arial, sans-serif" font-size="48" fill="#999" text-anchor="middle">🖼️</text>
                <text x="100" y="120" font-family="Arial, sans-serif" font-size="14" fill="#666" text-anchor="middle">${text}</text>
            </svg>
        `;
        return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    };
    
    const tryNextPath = () => {
        if (currentTry < maxTries) {
            const nextPath = fallbackPaths[currentTry];
            log(`尝试加载图片路径 ${currentTry + 1}/${maxTries}: ${nextPath}`);
            imgElement.src = nextPath;
            currentTry++;
            
            // 设置超时，如果5秒内未加载成功，尝试下一个路径
            const timeout = setTimeout(() => {
                if (!imgElement.complete || imgElement.naturalHeight === 0) {
                    warn(`图片加载超时: ${nextPath}`);
                    tryNextPath();
                }
            }, 5000);
            
            // 如果加载成功，清除超时
            imgElement.onload = () => {
                clearTimeout(timeout);
                log(`图片加载成功: ${nextPath}`);
            };
        } else {
            // 所有路径都失败，显示美观的占位符
            error(`所有路径都失败，无法加载图片: ${imageName}`);
            if (imgElement.parentElement) {
                // 使用SVG占位符替代原图片
                imgElement.src = createPlaceholderSVG('图片加载失败');
                imgElement.alt = `图片加载失败: ${imageName}`;
                imgElement.style.backgroundColor = '#f5f5f5';
                imgElement.style.border = '2px dashed #ddd';
                imgElement.style.borderRadius = '8px';
                
                // 如果父容器有特定类名，也可以显示文字提示
                const container = imgElement.closest('.noun-image-container');
                if (container) {
                    const errorText = document.createElement('div');
                    errorText.className = 'image-error-text';
                    errorText.style.cssText = 'position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; white-space: nowrap;';
                    errorText.textContent = '图片未找到';
                    container.style.position = 'relative';
                    if (!container.querySelector('.image-error-text')) {
                        container.appendChild(errorText);
                    }
                }
            }
        }
    };
    
    // 清除之前的错误处理
    imgElement.onload = null;
    imgElement.onerror = tryNextPath;
    
    // 开始尝试第一个备用路径
    tryNextPath();
}

// ==================== 主题导航函数 ====================

// 渲染主题导航
function renderThemeNavigation() {
    const container = domCache.themeList || domCache.get('theme-list');
    if (!container) return;
    container.innerHTML = '';
    
    const themes = themeOrder[userConfig.userType];
    
    let nextLockedIndex = -1;
    let lockedCount = 0;
    
    // 找到第一个未解锁的主题索引
    themes.forEach((theme, index) => {
        const themeData = learningProgress.themes[theme] || {};
        if (themeData.status === 'locked') {
            if (nextLockedIndex === -1) {
                nextLockedIndex = index;
            }
            lockedCount++;
        }
    });
    
    // 渲染所有已解锁和下一个未解锁的主题
    themes.forEach((theme, index) => {
        const themeData = learningProgress.themes[theme] || {};
        
        // 只显示已解锁的主题和下一个未解锁的主题
        if (themeData.status === 'locked' && index !== nextLockedIndex) {
            return; // 跳过后续未解锁的主题
        }
        
        const item = document.createElement('div');
        item.className = 'theme-item';
        
        if (themeData.status === 'locked') {
            item.classList.add('locked');
        } else if (themeData.status === 'completed') {
            item.classList.add('completed');
        } else if (themeData.status === 'learning') {
            item.classList.add('learning');
        }
        
        const statusBadge = getThemeStatusBadge(themeData);
        
        item.innerHTML = `
            <div class="theme-name">${theme}</div>
            <div class="theme-status">${statusBadge}</div>
        `;
        
        item.onclick = () => {
            if (themeData.status !== 'locked') {
                selectTheme(theme, index);
            }
        };
        
        container.appendChild(item);
    });
    
    // 如果有多个未解锁的主题，显示数量提示
    if (lockedCount > 1) {
        const remainingCount = lockedCount - 1;
        const summaryItem = document.createElement('div');
        summaryItem.className = 'theme-item locked';
        summaryItem.style.opacity = '0.6';
        summaryItem.style.cursor = 'default';
        summaryItem.innerHTML = `
            <div class="theme-name">还有 ${remainingCount} 个主题未解锁</div>
            <div class="theme-status">
                <span class="theme-status-badge status-locked">完成当前主题后解锁</span>
            </div>
        `;
        container.appendChild(summaryItem);
    }
}

// 获取主题状态标识
function getThemeStatusBadge(themeData) {
    if (!themeData || themeData.status === 'locked') {
        return '<span class="theme-status-badge status-locked">未解锁</span>';
    }
    
    if (themeData.status === 'completed') {
        return '<span class="theme-status-badge status-completed">已完成</span>';
    }
    
    if (themeData.status === 'learning') {
        let statusText = '学习中';
        if (themeData.test1.status === 'completed') {
            statusText = '测试1已完成';
        }
        if (themeData.test2.status === 'completed') {
            statusText = '全部完成';
        }
        return `<span class="theme-status-badge status-learning">${statusText}</span>`;
    }
    
    return '';
}

// 选择主题
function selectTheme(theme, index) {
    learningProgress.currentThemeIndex = index;
    learningProgress.currentTheme = theme;
    saveLearningProgress();
    
    // 更新主题导航显示
    renderThemeNavigation();
    
    // 更新顶部栏进度和当前主题
    updateTopBarProgress();
    updateCurrentThemeDisplay();
    
    // 加载主题内容
    loadCurrentTheme();
    
    // 预加载下一个主题的图片
    imagePreloader.preloadNextTheme();
}

// 加载当前主题
function loadCurrentTheme() {
    const container = domCache.cardsContainer || document.getElementById('cards-container');
    if (!container) {
        error('cards-container not found');
        return;
    }
    
    // 确保 userConfig 已初始化
    if (!userConfig || !userConfig.userType) {
        container.innerHTML = `
            <div class="loader">
                <span class="icon icon-spin">⟳</span> 正在加载配置...
            </div>
        `;
        // 如果配置未完成，显示设置弹窗
        if (!userConfig || !userConfig.setupCompleted) {
            if (domCache.setupModal) {
                showModal('setup-modal');
            }
        }
        return;
    }
    
    // 确保 learningProgress 已初始化
    if (!learningProgress || !learningProgress.themes) {
        // 如果用户配置已完成但学习进度未初始化，重新初始化
        if (userConfig.setupCompleted) {
            initializeLearningProgress();
        } else {
            container.innerHTML = `
                <div class="loader">
                    <span class="icon icon-spin">⟳</span> 正在初始化学习进度...
                </div>
            `;
            return;
        }
    }
    
    // 如果当前主题不存在，设置默认主题
    if (!learningProgress.currentTheme) {
        const themes = themeOrder[userConfig.userType];
        if (themes && themes.length > 0) {
            learningProgress.currentTheme = themes[0];
            learningProgress.currentThemeIndex = 0;
            saveLearningProgress();
        } else {
            container.innerHTML = `
                <div class="loader">
                    <span class="icon">⚠️</span> 未找到可用主题
                </div>
            `;
            return;
        }
    }
    
    // 确保currentMode被正确设置
    if (!learningProgress.currentMode) {
        learningProgress.currentMode = 'learning';
    }
    
    // 显示加载动画（仅在容器为空或只有loader时）
    const hasContent = container.children.length > 0;
    const hasLoader = container.querySelector('.loader');
    if (!hasContent || hasLoader) {
        container.innerHTML = `
            <div class="loader">
                <span class="icon icon-spin">⟳</span> 正在加载卡片...
            </div>
        `;
    }
    
    // 调试信息
    log('=== loadCurrentTheme 开始 ===');
    log('开始加载主题:', learningProgress.currentTheme);
    log('当前模式:', learningProgress.currentMode);
    log('vocabulary类型:', typeof vocabulary);
    log('vocabulary是否为数组:', Array.isArray(vocabulary));
    if (Array.isArray(vocabulary)) {
        log('vocabulary长度:', vocabulary.length);
    }
    
    // 渲染卡片（vocabulary是同步定义的，不需要setTimeout）
    if (learningProgress.currentMode === 'learning') {
        log('进入学习模式渲染流程');
        // 确保vocabulary数据已加载
        if (typeof vocabulary === 'undefined' || !Array.isArray(vocabulary)) {
            error('vocabulary数据未定义，无法渲染卡片', typeof vocabulary);
            container.innerHTML = `
                <div class="loader">
                    <span class="icon">⚠️</span> 词汇数据未加载，请刷新页面重试
                </div>
            `;
            return;
        }
        
        log('调用 renderVocabularyCards，参数:', learningProgress.currentTheme);
        renderVocabularyCards(learningProgress.currentTheme);
        log('renderVocabularyCards 调用完成');
    } else {
        log('当前为测试模式，由startTest函数处理');
        // 测试模式，由startTest函数处理
    }
    log('=== loadCurrentTheme 完成 ===');
}

// ==================== 学习模式渲染函数 ====================

// 图片懒加载管理器 - 使用Intersection Observer
const imageLazyLoader = {
    observer: null,
    init: function() {
        // 检查浏览器是否支持Intersection Observer
        if (!('IntersectionObserver' in window)) {
            log('Intersection Observer不支持，使用传统加载方式');
            return false;
        }
        
        // 创建观察器，当图片进入视口时加载
        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const dataSrc = img.dataset.src;
                    if (dataSrc) {
                        // 加载图片
                        img.src = dataSrc;
                        img.removeAttribute('data-src');
                        // 停止观察该图片
                        this.observer.unobserve(img);
                    }
                }
            });
        }, {
            // 提前100px开始加载，提升用户体验
            rootMargin: '100px 0px',
            threshold: 0.01
        });
        
        return true;
    },
    observe: function(img) {
        if (this.observer) {
            this.observer.observe(img);
        } else {
            // 如果不支持，直接加载
            const dataSrc = img.dataset.src;
            if (dataSrc) {
                img.src = dataSrc;
                img.removeAttribute('data-src');
            }
        }
    },
    disconnect: function() {
        if (this.observer) {
            this.observer.disconnect();
        }
    }
};

// 遮挡层高度更新调度器 - 合并多次调用，减少重绘
const overlayUpdateScheduler = {
    pending: false,
    timer: null,
    schedule: function(immediate = false) {
        if (immediate) {
            // 立即执行并清除待执行的
            if (this.timer) {
                cancelAnimationFrame(this.timer);
                this.timer = null;
            }
            updateOverlayHeights();
            this.pending = false;
        } else if (!this.pending) {
            // 延迟执行，合并多次调用
            this.pending = true;
            this.timer = requestAnimationFrame(() => {
                updateOverlayHeights();
                this.pending = false;
                this.timer = null;
            });
        }
    },
    // 延迟调度（用于图片加载后）
    scheduleDelayed: function(delay = 100) {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
            this.schedule(true);
        }, delay);
    }
};

// 统一更新遮挡层高度，确保正反面显示一致
// 使用CSS变量进行计算，保证继承关系
function updateOverlayHeights() {
    const cards = document.querySelectorAll('.card');
    if (cards.length === 0) return;
    
    // 从CSS变量获取值，确保继承关系
    const root = document.documentElement;
    const cardPadding = parseFloat(getComputedStyle(root).getPropertyValue('--card-padding-learning')) || 3;
    const overlayHeightRatio = parseFloat(getComputedStyle(root).getPropertyValue('--overlay-height-ratio')) || 0.18337;
    
    cards.forEach(card => {
        const cardInner = card.querySelector('.card-inner');
        if (!cardInner) return;
        
        // 计算遮挡层应该的高度（像素值）
        const cardHeight = cardInner.offsetHeight;
        const contentHeight = cardHeight - (cardPadding * 2);
        const overlayHeight = contentHeight * overlayHeightRatio;
        
        // 统一设置正反面遮挡层的高度
        const frontOverlay = card.querySelector('.card-front .image-overlay');
        const backOverlay = card.querySelector('.card-back .image-overlay');
        
        if (frontOverlay) {
            frontOverlay.style.height = `${overlayHeight}px`;
        }
        if (backOverlay) {
            backOverlay.style.height = `${overlayHeight}px`;
        }
    });
}

// 更新渲染函数以使用动态图片路径
function renderVocabularyCards(category = 'all') {
    log('=== renderVocabularyCards 开始 ===');
    log('参数 category:', category);
    
    const container = domCache.cardsContainer || document.getElementById('cards-container');
    if (!container) {
        error('cards-container not found');
        return;
    }
    log('容器元素找到:', container);
    
    // 立即清除加载动画（同步执行，不等待）
    container.innerHTML = '';
    
    // 检查vocabulary数组是否存在
    if (!vocabulary || !Array.isArray(vocabulary)) {
        error('vocabulary数据未定义或不是数组:', vocabulary);
        error('vocabulary类型:', typeof vocabulary);
        container.innerHTML = `
            <div class="loader">
                <span class="icon">⚠️</span> 词汇数据未加载，请刷新页面重试
            </div>
        `;
        return;
    }
    
    // 检查vocabulary数组是否为空
    if (vocabulary.length === 0) {
        warn('vocabulary数组为空');
        container.innerHTML = `
            <div class="loader">
                <span class="icon">ℹ️</span> 暂无词汇数据
            </div>
        `;
        return;
    }
    
    log('vocabulary数组有效，长度:', vocabulary.length);
    
    // 处理 category 参数：如果为 null、undefined 或空字符串，使用 'all'
    if (!category || category === 'null' || category === 'undefined') {
        category = 'all';
    }
    log('处理后的 category:', category);
    
    // 根据类别过滤词汇
    let filteredVocabulary;
    if (category === 'all') {
        // 创建数组副本并随机排序
        filteredVocabulary = [...vocabulary].sort(() => Math.random() - 0.5);
        log('使用全部词汇，随机排序后长度:', filteredVocabulary.length);
    } else {
        filteredVocabulary = vocabulary.filter(item => item.category === category);
        log('过滤类别 "' + category + '" 后长度:', filteredVocabulary.length);
    }
    
    if (category !== 'all') {
        const carryOverCards = getCarryOverMistakes();
        if (carryOverCards.length > 0) {
            const existingWords = new Set(filteredVocabulary.map(item => item.noun));
            const uniqueCarryOvers = carryOverCards
                .filter(card => card && card.noun && !existingWords.has(card.noun))
                .map(card => ({ ...card, carryOver: true }));
            if (uniqueCarryOvers.length > 0) {
                log('追加复习卡片数量:', uniqueCarryOvers.length);
                filteredVocabulary = [...filteredVocabulary, ...uniqueCarryOvers];
            }
        }
    }
    
    // 更新总数 - 使用缓存
    const totalCountElement = domCache.totalCountElement || domCache.get('total-count');
    if (totalCountElement) {
        totalCountElement.textContent = vocabulary.length;
        log('总数已更新:', vocabulary.length);
    } else {
        warn('total-count 元素未找到');
    }
    
    if (filteredVocabulary.length === 0) {
        warn('过滤后的词汇为空');
        container.innerHTML = `
            <div class="loader">
                <span class="icon">ℹ️</span> 该类别下没有词汇
            </div>
        `;
        return;
    }
    
    log('开始渲染', filteredVocabulary.length, '张卡片...');
    
    // 使用DocumentFragment批量添加，提高性能
    const fragment = document.createDocumentFragment();
    
    // 渲染每个词汇卡片（已移除类别标题）
    filteredVocabulary.forEach(item => {
        // 创建卡片包装器
        const cardWrapper = document.createElement('div');
        cardWrapper.className = 'card-wrapper';
        
        // 创建卡片
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.word = item.noun;
        
        // 获取图片路径
        const imagePath = getImagePath(item.image, item.category);
        
        // 获取词性信息
        const genderInfo = getGenderInfo(item.gender, item.noun);
        const genderBadge = genderInfo 
            ? `<div class="gender-badge ${genderInfo.class}">${genderInfo.text}</div>` 
            : '';
        
        const isCarryOverCard = !!item.carryOver;
        card.dataset.carryOver = isCarryOverCard ? 'true' : 'false';
        const carryOverBadge = isCarryOverCard 
            ? `<div class="carryover-badge" title="来自上一主题的复习卡">复习卡</div>`
            : '';
        
        // 学习模式卡片：正面显示中文+图片，背面显示德语+词性+发音
        card.innerHTML = `
            <div class="card-inner">
                <!-- 卡片正面：中文+图片 -->
                <div class="card-face card-front learning-card-front">
                    ${carryOverBadge}
                    <div class="noun-image-container">
                        <img 
                            data-src="${imagePath}" 
                            alt="${item.meaning}" 
                            class="noun-image lazy-image"
                            data-image-name="${item.image}"
                            data-category="${item.category}"
                            onerror="handleImageError(this, '${item.image}', '${item.category}')"
                        >
                    </div>
                    <!-- 遮挡层：遮挡图片下方的德语信息，直接延伸到卡片底部 -->
                    <div class="image-overlay"></div>
                    <!-- 中文显示在遮挡层上 -->
                    <div class="meaning-display">${item.meaning}</div>
                </div>
                
                <!-- 卡片背面：德语+词性+发音+中文 -->
                <div class="card-face card-back learning-card-back">
                    ${carryOverBadge}
                    <div class="card-back-content">
                        <div class="noun-display">${item.noun}</div>
                        ${genderBadge}
                        <button class="speak-btn" onclick="speakWord('${item.noun}', event)" style="position: relative; top: 0; right: 0; margin: 15px auto;">
                            <span class="icon">🔊</span>
                        </button>
                    </div>
                    <!-- 遮挡层（已不再显示文字） -->
                    <div class="image-overlay"></div>
                    <!-- 中文显示在遮挡层上，格式与正面一致 -->
                    <div class="meaning-display">${item.meaning}</div>
                    <!-- 点击返回提示 -->
                    <div class="card-hint">点击卡片返回</div>
                </div>
            </div>
        `;
        
        // 存储词汇数据到卡片上，供事件委托使用
        card.dataset.noun = item.noun;
        card.dataset.meaning = item.meaning;
        
        // 图片懒加载处理
        const img = card.querySelector('.noun-image');
        if (img) {
            // 设置加载状态
            img.style.opacity = '0';
            img.style.transition = 'opacity 0.3s ease';
            
            // 使用懒加载观察器
            imageLazyLoader.observe(img);
            
            // 图片加载成功
            img.addEventListener('load', function() {
                this.style.opacity = '1';
                // 移除懒加载类，停止加载动画
                this.classList.remove('lazy-image');
                log('图片加载成功:', this.src);
            }, { once: true });
            
            // 图片加载失败（错误处理函数会处理）
            img.addEventListener('error', function() {
                warn('图片加载失败:', this.src);
                // 即使失败也显示（错误处理函数会尝试备用路径）
                this.style.opacity = '0.5';
            }, { once: true });
        }
        
        // 组装包装器（不再添加外部标题）
        cardWrapper.appendChild(card);
        // 使用DocumentFragment批量添加，提高性能
        fragment.appendChild(cardWrapper);
    });
    
    // 一次性将所有卡片添加到容器，减少DOM操作次数
    container.appendChild(fragment);
    log('所有卡片已添加到DOM，容器子元素数量:', container.children.length);
    
    // 初始化事件委托（统一处理卡片点击）
    initLearningModeEventDelegation();
    
    // 使用调度器合并多次更新调用
    // 立即更新一次（不等待图片加载，让页面立即显示）
    overlayUpdateScheduler.schedule(true);
    
    // 延迟更新（图片加载后）
    overlayUpdateScheduler.scheduleDelayed(100);
    overlayUpdateScheduler.scheduleDelayed(500);
    overlayUpdateScheduler.scheduleDelayed(2000);
    
    // 预加载下一个主题的图片（后台进行，不影响当前体验）
    imagePreloader.preloadNextTheme();
    
    log('=== renderVocabularyCards 完成 ===');
}

// 初始化学习模式事件委托 - 在容器上统一处理卡片点击
function initLearningModeEventDelegation() {
    const container = domCache.cardsContainer;
    if (!container) return;
    
    // 移除旧的事件监听器（如果存在）
    if (container._learningModeClickHandler) {
        container.removeEventListener('click', container._learningModeClickHandler);
    }
    
    // 创建新的事件处理函数
    container._learningModeClickHandler = function(e) {
        // 查找被点击的卡片
        const card = e.target.closest('.card');
        if (!card) return;
        
        // 如果点击的是发音按钮，不翻转卡片
        if (e.target.closest('.speak-btn')) {
            e.stopPropagation();
            const noun = card.dataset.noun;
            if (noun) {
                speakWord(noun, e);
            }
            return;
        }
        
        // 检查是否被锁定
        if (card.dataset.interactionLocked === 'true') {
            return;
        }
        
        // 翻转卡片
        card.classList.toggle('flipped');
        
        // 点击卡片时自动朗读
        if (card.classList.contains('flipped')) {
            const noun = card.dataset.noun;
            const meaning = card.dataset.meaning;
            if (noun && meaning) {
                speakWordAndMeaning(noun, meaning);
            }
        }
    };
    
    // 添加事件监听器
    container.addEventListener('click', container._learningModeClickHandler);
}

// ==================== 测试模式函数 ====================

// 进度条已整合到卡片内部，不再需要独立的位置更新函数

// 开始测试
function startTest(testType) {
    // 确保固定顶部栏显示（特别是在移动端测试模式下）
    if (domCache.fixedTopBar) {
        domCache.fixedTopBar.style.display = 'flex';
    }
    
    const theme = learningProgress.currentTheme;
    if (!theme) return;
    
    learningProgress.currentTestType = testType;
    const themeData = learningProgress.themes[theme];
    
    // 检查是否可以开始测试
    if (testType === 'test1') {
        // 测试1需要主题已解锁且test1状态为available
        if (themeData.status === 'locked' || themeData.test1.status === 'locked') {
            alert('请先完成学习');
            return;
        }
    } else if (testType === 'test2') {
        // 测试2需要已解锁
        if (!themeData.test2.unlocked || themeData.test2.status === 'locked') {
            alert('测试2尚未解锁');
            return;
        }
    }
    
    // 生成测试题目
    const testTypeName = testType === 'test1' ? 'meaning' : 'gender';
    const generated = generateTestQuestions(theme, testTypeName);
    if (!generated) {
        const container = domCache.cardsContainer || document.getElementById('cards-container');
        if (container) {
            container.innerHTML = `
                <div class="loader">
                    <span class="icon">ℹ️</span> 暂无可测试的卡片，请先完成学习或复习上一主题。
                </div>
            `;
        }
        return;
    }
    
    // 渲染第一题
    renderTestCard(0);
    
    // 更新进度显示
    updateTestProgress();
    
    // 隐藏独立的进度条（现在进度条已整合到卡片内部）
    const independentProgress = document.getElementById('test-progress');
    if (independentProgress) {
        independentProgress.style.display = 'none';
    }
}

// 生成测试题目
function generateTestQuestions(theme, type) {
    const themeWords = vocabulary.filter(item => item.category === theme);
    const shuffledThemeWords = [...themeWords].sort(() => Math.random() - 0.5);
    const baseCount = themeWords.length === 0 ? 0 : Math.max(1, Math.ceil(themeWords.length * 0.6));
    const targetCount = Math.min(baseCount, themeWords.length);
    
    const carryOverWords = getCarryOverMistakes();
    const carryOverMap = new Map();
    carryOverWords.forEach(word => {
        if (word && word.noun) {
            carryOverMap.set(word.noun, word);
        }
    });
    
    const selectedThemeWords = [];
    for (const word of shuffledThemeWords) {
        if (!carryOverMap.has(word.noun)) {
            selectedThemeWords.push(word);
        }
        if (selectedThemeWords.length >= targetCount) {
            break;
        }
    }
    
    const buildQuestion = (word, index, source = 'theme') => ({
        id: `${source}-${word.noun}-${index}`,
        word,
        source,
        correctAnswer: type === 'meaning' ? word.meaning : (word.gender || (isPluralNoun(word.noun) ? 'die' : 'die')),
        options: type === 'meaning' 
            ? generateMeaningOptions(word, vocabulary.filter(item => item.category === word.category))
            : generateGenderOptions(word)
    });
    
    const carryOverQuestions = carryOverWords
        .filter(word => word && word.noun)
        .map((word, index) => buildQuestion(word, index, 'carryover'));
    const themeQuestions = selectedThemeWords
        .map((word, index) => buildQuestion(word, index + carryOverQuestions.length, 'theme'));
    
    const combinedQuestions = [...carryOverQuestions, ...themeQuestions];
    
    if (combinedQuestions.length === 0) {
        alert('当前主题暂无可用题目，请先完成学习或复习上一主题。');
        return false;
    }
    
    currentTest = {
        type: type,
        theme: theme,
        questions: combinedQuestions,
        currentIndex: 0,
        answers: [],
        startTime: Date.now()
    };
    
    return true;
}

function syncCarryOverMistakesAfterTest() {
    if (!currentTest || !Array.isArray(currentTest.questions)) return;
    const isMeaningTest = currentTest.type === 'meaning';
    currentTest.questions.forEach((question, index) => {
        if (!question || !question.word) return;
        const noun = question.word.noun;
        const answer = currentTest.answers[index];
        if (answer && answer.correct) {
            removeCarryOverMistake(noun);
        } else if (isMeaningTest && question.source === 'theme') {
            addCarryOverMistake(question.word);
        }
    });
}

// 语义相关的干扰项映射（精心设计的诱惑选项）
const semanticDistractors = {
    // 时间和日期相关
    '上午': ['下午', '中午', '早晨'],
    '下午': ['上午', '中午', '傍晚'],
    '中午': ['上午', '下午', '早晨'],
    '早晨': ['上午', '中午', '傍晚'],
    '傍晚': ['下午', '中午', '夜'],
    '夜': ['傍晚', '早晨', '中午'],
    '周六': ['周日', '周末', '周五'],
    '周日': ['周六', '周末', '周一'],
    '周末': ['周六', '周日', '周五'],
    '周一': ['周二', '周日', '周末'],
    '春天': ['夏天', '秋天', '冬天'],
    '夏天': ['春天', '秋天', '冬天'],
    '秋天': ['春天', '夏天', '冬天'],
    '冬天': ['春天', '夏天', '秋天'],
    '1月': ['2月', '12月', '3月'],
    '3月': ['4月', '2月', '5月'],
    '5月': ['6月', '4月', '7月'],
    '6月': ['7月', '5月', '8月'],
    '7月': ['8月', '6月', '9月'],
    '12月': ['1月', '11月', '10月'],
    '开始': ['结束', '中间', '继续'],
    '结束': ['开始', '中间', '继续'],
    
    // 家庭关系相关
    '父亲': ['母亲', '儿子', '女儿'],
    '母亲': ['父亲', '儿子', '女儿'],
    '儿子': ['女儿', '父亲', '母亲'],
    '女儿': ['儿子', '父亲', '母亲'],
    '兄弟': ['姐妹', '父亲', '母亲'],
    '姐妹': ['兄弟', '父亲', '母亲'],
    '丈夫': ['妻子', '父亲', '母亲'],
    '妻子': ['丈夫', '父亲', '母亲'],
    '朋友': ['女朋友', '家人', '同事'],
    '女朋友': ['朋友', '妻子', '姐妹'],
    '男孩': ['女孩', '儿子', '兄弟'],
    '女孩': ['男孩', '女儿', '姐妹'],
    '孩子': ['婴儿', '男孩', '女孩'],
    '婴儿': ['孩子', '男孩', '女孩'],
    '成人': ['孩子', '婴儿', '老人'],
    
    // 衣服相关
    '鞋子': ['袜子', '裤子', '衣服'],
    '裤子': ['短裙', '鞋子', '衣服'],
    '短裙': ['裤子', '衣服', '夹克'],
    '夹克': ['长外套', '毛衣', '衣服'],
    '长外套': ['夹克', '毛衣', '衣服'],
    '毛衣': ['夹克', '长外套', '衣服'],
    '衣服': ['裤子', '鞋子', '夹克'],
    
    // 食物相关
    '早餐': ['中餐', '晚餐', '午餐'],
    '中餐': ['早餐', '晚餐', '午餐'],
    '晚餐': ['中餐', '早餐', '午餐'],
    '苹果': ['橙子', '香蕉', '梨'],
    '橙子': ['苹果', '香蕉', '梨'],
    '香蕉': ['苹果', '橙子', '梨'],
    '梨': ['苹果', '橙子', '香蕉'],
    '咖啡': ['茶', '水', '果汁'],
    '茶': ['咖啡', '水', '果汁'],
    '水': ['咖啡', '茶', '果汁'],
    '果汁': ['咖啡', '茶', '水'],
    '啤酒': ['葡萄酒', '水', '果汁'],
    '葡萄酒': ['啤酒', '水', '果汁'],
    '肉': ['鱼', '鸡肉', '香肠'],
    '鱼': ['肉', '鸡肉', '香肠'],
    '鸡肉': ['肉', '鱼', '香肠'],
    '香肠': ['肉', '鱼', '火腿'],
    '火腿': ['香肠', '肉', '鱼'],
    '面包': ['小面包', '蛋糕', '米饭'],
    '小面包': ['面包', '蛋糕', '米饭'],
    '蛋糕': ['面包', '小面包', '米饭'],
    '米饭': ['面包', '面条', '蛋糕'],
    '面条': ['米饭', '面包', '蛋糕'],
    '土豆': ['西红柿', '蔬菜', '水果'],
    '西红柿': ['土豆', '蔬菜', '水果'],
    '蔬菜': ['水果', '土豆', '西红柿'],
    '水果': ['蔬菜', '土豆', '西红柿'],
    '盐': ['糖', '油', '黄油'],
    '油': ['盐', '糖', '黄油'],
    '黄油': ['盐', '油', '糖'],
    '奶酪': ['黄油', '牛奶', '鸡蛋'],
    '牛奶': ['奶酪', '黄油', '鸡蛋'],
    '鸡蛋': ['奶酪', '牛奶', '黄油'],
    
    // 居住相关
    '房间': ['客厅', '卧室', '厨房'],
    '客厅': ['房间', '卧室', '厨房'],
    '卧室': ['房间', '客厅', '厨房'],
    '厨房': ['房间', '客厅', '浴室'],
    '浴室': ['厨房', '卫生间', '房间'],
    '卫生间': ['浴室', '厨房', '房间'],
    '门': ['窗', '入口', '出口'],
    '窗': ['门', '入口', '出口'],
    '入口': ['出口', '门', '窗'],
    '出口': ['入口', '门', '窗'],
    '桌子': ['椅子', '沙发', '床'],
    '椅子': ['桌子', '沙发', '床'],
    '沙发': ['桌子', '椅子', '床'],
    '床': ['桌子', '椅子', '沙发'],
    '柜子': ['桌子', '椅子', '沙发'],
    '镜子': ['画', '图片', '墙'],
    '画': ['镜子', '图片', '墙'],
    '图片': ['画', '镜子', '墙'],
    '墙': ['画', '图片', '镜子'],
    '城市': ['乡村', '村庄', '国家'],
    '乡村': ['城市', '村庄', '国家'],
    '村庄': ['城市', '乡村', '国家'],
    '国家': ['城市', '乡村', '村庄'],
    
    // 交通相关
    '火车': ['地铁', '公交', '轻轨'],
    '地铁': ['火车', '公交', '轻轨'],
    '公交': ['火车', '地铁', '轻轨'],
    '轻轨': ['火车', '地铁', '公交'],
    '飞机': ['火车', '轮船', '汽车'],
    '轮船': ['飞机', '火车', '汽车'],
    '汽车': ['飞机', '火车', '自行车'],
    '自行车': ['汽车', '摩托车', '公交'],
    '机场': ['火车站', '汽车站', '港口'],
    '火车站': ['机场', '汽车站', '港口'],
    '车票': ['机票', '船票', '门票'],
    '机票': ['车票', '船票', '门票'],
    '船票': ['车票', '机票', '门票'],
    '门票': ['车票', '机票', '船票'],
    
    // 购物相关
    '商店': ['超市', '商场', '面包店'],
    '超市': ['商店', '商场', '面包店'],
    '商场': ['商店', '超市', '面包店'],
    '面包店': ['商店', '超市', '商场'],
    '价格': ['重量', '尺寸', '颜色'],
    '重量': ['价格', '尺寸', '颜色'],
    '尺寸': ['价格', '重量', '颜色'],
    '颜色': ['价格', '重量', '尺寸'],
    '钱': ['欧元', '价格', '账单'],
    '欧元': ['钱', '价格', '账单'],
    '账单': ['钱', '价格', '欧元'],
    
    // 身体部位相关
    '头': ['眼睛', '耳朵', '鼻子'],
    '眼睛': ['头', '耳朵', '鼻子'],
    '耳朵': ['头', '眼睛', '鼻子'],
    '鼻子': ['头', '眼睛', '耳朵'],
    '嘴': ['牙齿', '舌头', '鼻子'],
    '牙齿': ['嘴', '舌头', '鼻子'],
    '手': ['脚', '手臂', '腿'],
    '脚': ['手', '手臂', '腿'],
    '手臂': ['手', '脚', '腿'],
    '腿': ['手', '脚', '手臂'],
    '肚子': ['头', '手', '脚'],
    '头发': ['头', '眼睛', '耳朵'],
    
    // 学习和工作相关
    '学校': ['课程', '班级', '老师'],
    '课程': ['学校', '班级', '老师'],
    '班级': ['学校', '课程', '老师'],
    '老师': ['学校', '课程', '学生'],
    '学生': ['老师', '学校', '课程'],
    '同事': ['老师', '学生', '老板'],
    '老板': ['同事', '老师', '学生'],
    '工作': ['职业', '公司', '办公室'],
    '职业': ['工作', '公司', '办公室'],
    '公司': ['工作', '职业', '办公室'],
    '办公室': ['工作', '职业', '公司'],
    '考试': ['课程', '作业', '练习'],
    '作业': ['考试', '课程', '练习'],
    '练习': ['考试', '课程', '作业'],
    '错误': ['答案', '问题', '练习'],
    '答案': ['错误', '问题', '练习'],
    '问题': ['答案', '错误', '练习'],
    '书': ['纸', '笔', '本子'],
    '纸': ['书', '笔', '本子'],
    '笔': ['书', '纸', '铅笔'],
    '铅笔': ['笔', '纸', '圆珠笔'],
    '圆珠笔': ['铅笔', '笔', '纸'],
    '本子': ['书', '纸', '笔'],
    
    // 业余活动相关
    '电影': ['音乐', '书', '游戏'],
    '音乐': ['电影', '书', '游戏'],
    '游戏': ['电影', '音乐', '书'],
    '书': ['电影', '音乐', '游戏'],
    '运动': ['足球', '游泳', '散步'],
    '足球': ['运动', '游泳', '散步'],
    '游泳': ['运动', '足球', '散步'],
    '散步': ['运动', '足球', '游泳'],
    '太阳': ['月亮', '星星', '天空'],
    '月亮': ['太阳', '星星', '天空'],
    '星星': ['太阳', '月亮', '天空'],
    '天气': ['太阳', '雨', '风'],
    '雨': ['天气', '太阳', '风'],
    '风': ['天气', '太阳', '雨'],
    '湖': ['海', '河', '游泳池'],
    '海': ['湖', '河', '游泳池'],
    '河': ['湖', '海', '游泳池'],
    '游泳池': ['湖', '海', '河'],
    '礼物': ['邀请', '节日', '庆祝'],
    '邀请': ['礼物', '节日', '庆祝'],
    '节日': ['礼物', '邀请', '庆祝'],
    '庆祝': ['礼物', '邀请', '节日'],
    '假期': ['度假', '休息', '旅行'],
    '度假': ['假期', '休息', '旅行'],
    '旅行': ['假期', '度假', '休息'],
    
    // 银行和邮局相关
    '银行': ['邮局', '账户', '钱'],
    '邮局': ['银行', '账户', '钱'],
    '账户': ['银行', '邮局', '钱'],
    '信': ['明信片', '邮票', '信封'],
    '明信片': ['信', '邮票', '信封'],
    '邮票': ['信', '明信片', '信封'],
    '电话': ['手机', '传真', '答录机'],
    '手机': ['电话', '传真', '答录机'],
    '传真': ['电话', '手机', '答录机'],
    '答录机': ['电话', '手机', '传真'],
    
    // 看医生相关
    '医生': ['牙医', '诊所', '医院'],
    '牙医': ['医生', '诊所', '医院'],
    '诊所': ['医生', '牙医', '医院'],
    '医院': ['医生', '牙医', '诊所'],
    '药品': ['药', '处方', '治疗'],
    '药': ['药品', '处方', '治疗'],
    '处方': ['药品', '药', '治疗'],
    '治疗': ['药品', '药', '处方'],
    '药店': ['诊所', '医院', '医生'],
    
    // 文具相关（青少年）
    '书包': ['笔袋', '本子', '书'],
    '笔袋': ['书包', '本子', '书'],
    '本子': ['书包', '笔袋', '书'],
    '橡皮': ['铅笔', '尺子', '卷笔刀'],
    '尺子': ['橡皮', '铅笔', '卷笔刀'],
    '卷笔刀': ['橡皮', '尺子', '铅笔'],
    '剪刀': ['胶水', '尺子', '卷笔刀'],
    '胶水': ['剪刀', '尺子', '卷笔刀'],
    '眼镜': ['眼睛', '视力', '镜片'],
    
    // 动物相关（青少年）
    '狗': ['猫', '兔子', '鸟'],
    '猫': ['狗', '兔子', '鸟'],
    '兔子': ['狗', '猫', '鸟'],
    '鸟': ['狗', '猫', '兔子'],
    '宠物': ['狗', '猫', '兔子'],
    '马': ['牛', '羊', '猪'],
    '牛': ['马', '羊', '猪'],
    '羊': ['马', '牛', '猪'],
    '猪': ['马', '牛', '羊'],
    '老虎': ['狮子', '豹子', '狼'],
    '狮子': ['老虎', '豹子', '狼'],
    '豹子': ['老虎', '狮子', '狼'],
    '狼': ['老虎', '狮子', '豹子']
};

// 获取语义相关的干扰项
function getSemanticDistractors(meaning) {
    // 处理带标点的含义（如"天、白天"）
    const cleanMeaning = meaning.split('、')[0].split('，')[0].trim();
    return semanticDistractors[cleanMeaning] || [];
}

// 生成语义测试选项
function generateMeaningOptions(correctWord, allWords) {
    const correctMeaning = correctWord.meaning;
    const options = [correctMeaning];
    
    // 获取语义相关的干扰项
    const semanticOptions = getSemanticDistractors(correctMeaning);
    
    // 从同主题词汇中查找语义相关的干扰项
    const themeWords = allWords.filter(w => w.meaning !== correctMeaning);
    const foundSemanticOptions = [];
    
    // 优先选择语义相关的干扰项
    for (const semanticOption of semanticOptions) {
        const found = themeWords.find(w => {
            const wMeaning = w.meaning.split('、')[0].split('，')[0].trim();
            return wMeaning === semanticOption || w.meaning.includes(semanticOption);
        });
        if (found && foundSemanticOptions.length < 1) {
            foundSemanticOptions.push(found.meaning);
        }
    }
    
    // 添加精心设计的诱惑选项（1个）
    if (foundSemanticOptions.length > 0) {
        options.push(foundSemanticOptions[0]);
    }
    
    // 添加两个随机干扰选项
    const remainingWords = themeWords.filter(w => !options.includes(w.meaning));
    const shuffled = [...remainingWords].sort(() => Math.random() - 0.5);
    
    const neededCount = 4 - options.length;
    for (let i = 0; i < neededCount && i < shuffled.length; i++) {
        options.push(shuffled[i].meaning);
    }
    
    // 如果选项不足4个，从所有词汇中补充
    if (options.length < 4) {
        const allOtherWords = vocabulary.filter(w => 
            w.category === correctWord.category && 
            !options.includes(w.meaning)
        );
        const shuffledAll = [...allOtherWords].sort(() => Math.random() - 0.5);
        for (let i = 0; i < 4 - options.length && i < shuffledAll.length; i++) {
            options.push(shuffledAll[i].meaning);
        }
    }
    
    // 随机打乱选项
    return options.sort(() => Math.random() - 0.5);
}

// 生成词性测试选项
function generateGenderOptions(correctWord) {
    const genders = ['der', 'die', 'das'];
    const correctGender = correctWord.gender || (isPluralNoun(correctWord.noun) ? 'die' : 'die');
    
    // 确保正确答案在选项中
    const options = [correctGender];
    
    // 添加其他选项
    genders.forEach(g => {
        if (g !== correctGender && options.length < 4) {
            options.push(g);
        }
    });
    
    // 如果选项不足4个，补充
    while (options.length < 4) {
        const randomGender = genders[Math.floor(Math.random() * genders.length)];
        if (!options.includes(randomGender)) {
            options.push(randomGender);
        }
    }
    
    // 随机打乱
    return options.sort(() => Math.random() - 0.5);
}

// 渲染测试卡片
function renderTestCard(questionIndex) {
    const container = domCache.cardsContainer || document.getElementById('cards-container');
    if (container) {
    container.innerHTML = '';
    }
    
    if (questionIndex >= currentTest.questions.length) {
        completeTest();
        return;
    }
    
    const question = currentTest.questions[questionIndex];
    
    // 创建标题行容器（包含测试提示文字和外部标题）
    const titleRow = document.createElement('div');
    titleRow.className = 'test-title-row';
    
    // 获取测试提示文字元素
    const testInstruction = document.getElementById('test-instruction');
    if (testInstruction) {
        // 将测试提示文字添加到标题行
        titleRow.appendChild(testInstruction.cloneNode(true));
        // 隐藏原来的测试提示文字（因为已经移到标题行中）
        testInstruction.style.display = 'none';
    }
    
    // 创建外部标题（测试模式下显示题目和答案）
    const cardTitle = document.createElement('div');
    cardTitle.className = 'card-external-title';
    cardTitle.innerHTML = `
        <div class="card-title-indicators">
            <span class="card-title-front active">题目</span>
            <span class="card-title-separator">|</span>
            <span class="card-title-back">答案</span>
        </div>
        <span class="card-title-hint">请找出和德语单词匹配的选项：</span>
    `;
    if (question.source === 'carryover') {
        const badge = document.createElement('span');
        badge.className = 'carryover-badge small';
        badge.textContent = '复习卡';
        cardTitle.appendChild(badge);
    }
    
    // 将外部标题添加到标题行
    titleRow.appendChild(cardTitle);
    
    // 创建卡片包装器
    const cardWrapper = document.createElement('div');
    cardWrapper.className = 'card-wrapper';
    
    const card = document.createElement('div');
    card.className = 'card test-card';
    if (question.source === 'carryover') {
        card.classList.add('carryover-card');
    }
    
    const imagePath = getImagePath(question.word.image, question.word.category);
    const genderInfo = getGenderInfo(question.word.gender, question.word.noun);
    const genderBadge = genderInfo 
        ? `<div class="gender-badge ${genderInfo.class}">${genderInfo.text}</div>` 
        : '';
    
    // 计算答案是否正确（如果已选择）
    let isCorrect = false;
    if (currentTest.answers[questionIndex]) {
        const selectedOption = question.options[currentTest.answers[questionIndex].selectedIndex];
        const normalizedSelected = normalizeMeaning(selectedOption);
        const normalizedCorrect = normalizeMeaning(question.correctAnswer);
        isCorrect = normalizedSelected === normalizedCorrect;
    }
    
    // 计算进度
    const total = currentTest.questions.length;
    const current = questionIndex + 1;
    const progress = (current / total) * 100;
    
    card.innerHTML = `
        <div class="card-inner">
            <!-- 测试卡片正面：题目+选项 -->
            <div class="card-face card-front">
                <div class="card-front-content">
                <div class="test-question">${question.word.noun}</div>
                <div class="test-options" id="test-options-${questionIndex}">
                    ${question.options.map((option, idx) => `
                        <div class="test-option" data-option="${idx}" onclick="selectOption(${questionIndex}, ${idx})">
                            ${option}
                        </div>
                    `).join('')}
                    </div>
                </div>
                <!-- 进度条区域 - 植入卡片正面内部 -->
                <div class="card-progress">
                    <div class="progress-info">
                        <span>${currentTest.type === 'meaning' ? '语义测试' : '词性测试'}</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="height: ${progress}%"></div>
                    </div>
                    <div class="progress-label">${current}/${total}</div>
                </div>
            </div>
            
            <!-- 测试卡片背面：答案+反馈 -->
            <div class="card-face card-back">
                <div class="card-back-content test-feedback">
                    <!-- 上方中文显示区域 -->
                    <div class="chinese-section">
                        <div class="chinese-meaning">${question.word.meaning}</div>
                        </div>
                    
                    <!-- 下方图片区域 - 占据卡片高度的60%，底部对齐 -->
                    <div class="image-section">
                    <img src="${imagePath}" alt="${question.word.noun}" class="noun-image">
                    </div>
                </div>
                <!-- 进度条区域 - 植入卡片背面内部 -->
                <div class="card-progress">
                    <div class="progress-info">
                        <span>${currentTest.type === 'meaning' ? '语义测试' : '词性测试'}</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="height: ${progress}%"></div>
                    </div>
                    <div class="progress-label">${current}/${total}</div>
                </div>
            </div>
        </div>
    `;
    
    // 如果已经选择过答案，显示反馈
    if (currentTest.answers[questionIndex]) {
        const selectedIdx = currentTest.answers[questionIndex].selectedIndex;
        // 使用标准化比较查找正确答案索引
        const normalizedCorrect = normalizeMeaning(question.correctAnswer);
        let correctIdx = -1;
        for (let i = 0; i < question.options.length; i++) {
            if (normalizeMeaning(question.options[i]) === normalizedCorrect) {
                correctIdx = i;
                break;
            }
        }
        
        const options = card.querySelectorAll('.test-option');
        options[selectedIdx].classList.add('selected');
        
        // 重新计算是否正确（确保与背面一致）
        const selectedOption = question.options[selectedIdx];
        const normalizedSelected = normalizeMeaning(selectedOption);
        const isCorrect = normalizedSelected === normalizedCorrect;
        
        if (isCorrect) {
            options[selectedIdx].classList.add('correct');
        } else {
            options[selectedIdx].classList.add('incorrect');
            if (correctIdx >= 0) {
                options[correctIdx].classList.add('correct');
            }
        }
        
        // 更新答案记录中的correct字段
        currentTest.answers[questionIndex].correct = isCorrect;
        
        // 自动翻转显示答案
        lockCardInteraction(card, 800);
        setTimeout(() => {
            card.classList.add('flipped');
            lockCardInteraction(card, 350);
            // 更新外部标题的激活状态和提示文字（从标题行中查找）
            const titleRow = container.querySelector('.test-title-row');
            if (titleRow) {
                const titleFront = titleRow.querySelector('.card-title-front');
                const titleBack = titleRow.querySelector('.card-title-back');
                const titleHint = titleRow.querySelector('.card-title-hint');
                if (titleFront && titleBack) {
                    titleFront.classList.remove('active');
                    titleBack.classList.add('active');
                }
                if (titleHint) {
                    titleHint.textContent = '请点击卡片任意位置继续：';
                    titleHint.style.display = 'block';
                }
            }
        }, 500);
    } else {
        // 新题目，确保卡片未翻转
        card.classList.remove('flipped');
        // 更新外部标题的激活状态和提示文字（从标题行中查找）
        const titleRow = container.querySelector('.test-title-row');
        if (titleRow) {
            const titleFront = titleRow.querySelector('.card-title-front');
            const titleBack = titleRow.querySelector('.card-title-back');
            const titleHint = titleRow.querySelector('.card-title-hint');
            if (titleFront && titleBack) {
                titleFront.classList.add('active');
                titleBack.classList.remove('active');
            }
            if (titleHint) {
                titleHint.textContent = '请找出和德语单词匹配的选项：';
                titleHint.style.display = 'block';
            }
        }
    }
    
    // 添加点击事件处理，支持手动翻转
    card.addEventListener('click', function(e) {
        if (this.dataset.interactionLocked === 'true') {
            return;
        }
        // 如果点击的是选项按钮，不翻转卡片
        if (e.target.closest('.test-option')) {
            return;
        }
        
        // 只有在已选择答案后才能翻转
        if (currentTest.answers[questionIndex]) {
            const answer = currentTest.answers[questionIndex];
            const isCurrentCorrect = answer && answer.correct;
            const wasFlipped = this.classList.contains('flipped');
            
            // 检查是否已经查看过答案（答错后从背面翻回正面）
            const titleRow = container.querySelector('.test-title-row');
            const titleHint = titleRow ? titleRow.querySelector('.card-title-hint') : null;
            const isWaitingForNext = titleHint && titleHint.textContent.includes('请再次点击卡片进入下一题');
            
            // 如果答错且已经查看过答案，再次点击时直接进入下一题
            if (!isCurrentCorrect && isWaitingForNext && !wasFlipped) {
                currentTest.currentIndex++;
                if (currentTest.currentIndex < currentTest.questions.length) {
                    renderTestCard(currentTest.currentIndex);
                    updateTestProgress();
                } else {
                    completeTest();
                }
                return;
            }
            lockCardInteraction(this, 650);
            // 正常翻转逻辑
            this.classList.toggle('flipped');
            const isFlipped = this.classList.contains('flipped');
            
            // 更新外部标题的激活状态和提示文字（从标题行中查找）
            if (titleRow) {
                const titleFront = titleRow.querySelector('.card-title-front');
                const titleBack = titleRow.querySelector('.card-title-back');
                if (isFlipped) {
                    // 翻转到背面
                    if (titleFront && titleBack) {
                        titleFront.classList.remove('active');
                        titleBack.classList.add('active');
                    }
                    if (titleHint) {
                        titleHint.textContent = '请点击卡片返回正面继续下一题：';
                        titleHint.style.display = 'block';
                    }
                } else {
                    // 从背面翻回正面
                    if (titleFront && titleBack) {
                        titleFront.classList.add('active');
                        titleBack.classList.remove('active');
                    }
                    
                    if (wasFlipped && !isFlipped) {
                        // 无论是答对还是答错，从背面翻回正面时都直接进入下一题
                        if (titleHint) {
                            titleHint.textContent = '请找出和德语单词匹配的选项：';
                            titleHint.style.display = 'block';
                        }
                        currentTest.currentIndex++;
                        if (currentTest.currentIndex < currentTest.questions.length) {
                            renderTestCard(currentTest.currentIndex);
                            updateTestProgress();
                        } else {
                            completeTest();
                        }
                    }
                }
            }
        }
    });
    
    // 组装：先添加标题行，再添加卡片包装器
    container.appendChild(titleRow);
    cardWrapper.appendChild(card);
    container.appendChild(cardWrapper);
    
    // 进度条已整合到卡片内部，无需更新位置
}

// 标准化含义字符串（用于比较）
function normalizeMeaning(meaning) {
    if (!meaning) return '';
    // 去除首尾空格，处理多个含义的情况
    return meaning.trim().split('、')[0].split('，')[0].split('（')[0].trim();
}

// 选择选项
function selectOption(questionIndex, optionIndex) {
    // 如果已经选择过，不允许再次选择
    if (currentTest.answers[questionIndex]) {
        return;
    }
    
    const question = currentTest.questions[questionIndex];
    const selectedOption = question.options[optionIndex];
    
    // 标准化比较：处理含义可能有多个值的情况（如"天、白天"）
    const normalizedSelected = normalizeMeaning(selectedOption);
    const normalizedCorrect = normalizeMeaning(question.correctAnswer);
    const isCorrect = normalizedSelected === normalizedCorrect;
    
    // 播放音效
    if (isCorrect) {
        playCorrectSound();
    } else {
        playIncorrectSound();
    }
    
    // 保存答案
    currentTest.answers[questionIndex] = {
        selectedIndex: optionIndex,
        selectedAnswer: selectedOption,
        correct: isCorrect
    };
    
    // 更新选项样式
    const options = document.querySelectorAll(`#test-options-${questionIndex} .test-option`);
    options.forEach((opt, idx) => {
        opt.classList.remove('selected', 'correct', 'incorrect');
        if (idx === optionIndex) {
            opt.classList.add('selected');
            if (isCorrect) {
                opt.classList.add('correct');
            } else {
                opt.classList.add('incorrect');
                // 标记正确答案（使用标准化比较）
                const normalizedCorrect = normalizeMeaning(question.correctAnswer);
                for (let i = 0; i < question.options.length; i++) {
                    if (normalizeMeaning(question.options[i]) === normalizedCorrect) {
                        options[i].classList.add('correct');
                        break;
                    }
                }
            }
        }
    });
    
    // 答对时自动翻转，答错时停留让用户查看错误选项
    if (isCorrect) {
        // 答对：延迟后自动翻转卡片显示反馈
    const card = document.querySelector('.test-card');
    lockCardInteraction(card, 1100);
    setTimeout(() => {
        if (card) {
            card.classList.add('flipped');
            lockCardInteraction(card, 400);
                // 更新外部标题的激活状态（从标题行中查找）
                const container = domCache.cardsContainer || document.getElementById('cards-container');
                const titleRow = container ? container.querySelector('.test-title-row') : null;
                if (titleRow) {
                    const titleFront = titleRow.querySelector('.card-title-front');
                    const titleBack = titleRow.querySelector('.card-title-back');
                    const titleHint = titleRow.querySelector('.card-title-hint');
                    if (titleFront && titleBack) {
                        titleFront.classList.remove('active');
                        titleBack.classList.add('active');
                    }
                    if (titleHint) {
                        titleHint.textContent = '请点击卡片返回正面继续下一题：';
                        titleHint.style.display = 'block';
                    }
                }
        }
    }, 1000);
    } else {
        // 答错：不自动翻转，提示用户点击卡片查看答案
        const container = domCache.cardsContainer || document.getElementById('cards-container');
        const titleRow = container ? container.querySelector('.test-title-row') : null;
        if (titleRow) {
            const titleHint = titleRow.querySelector('.card-title-hint');
            if (titleHint) {
                titleHint.textContent = '答错了，请点击卡片查看正确答案：';
                titleHint.style.display = 'block';
            }
        }
    }
    
    // 更新进度
    updateTestProgress();
}

// 更新测试进度
function updateTestProgress() {
    // 更新卡片内部的进度条（正面和背面都有）
    const cardProgresses = document.querySelectorAll('.test-card .card-progress');
    const total = currentTest.questions.length;
    const current = currentTest.currentIndex + 1;
    const progress = (current / total) * 100;
    
    cardProgresses.forEach(cardProgress => {
        const progressLabel = cardProgress.querySelector('.progress-label');
        const progressFill = cardProgress.querySelector('.progress-fill');
        
        if (progressLabel) {
            progressLabel.textContent = `${current}/${total}`;
        }
        if (progressFill) {
            progressFill.style.height = `${progress}%`;
        }
    });
    
    // 同时更新独立的进度条（如果存在，用于兼容）
    const progressLabel = document.getElementById('test-progress-label');
    const progressFill = document.getElementById('progress-fill');
    const typeLabel = document.getElementById('test-type-label');
    
    if (progressLabel && progressFill) {
    const total = currentTest.questions.length;
    const current = currentTest.currentIndex + 1;
    const progress = (current / total) * 100;
    
    progressLabel.textContent = `${current}/${total}`;
        progressFill.style.height = `${progress}%`;
    
    const testTypeName = currentTest.type === 'meaning' ? '语义' : '词性';
        if (typeLabel) {
    typeLabel.textContent = testTypeName;
        }
    }
}

// 完成测试
function completeTest() {
    const correctCount = currentTest.answers.filter(a => a && a.correct).length;
    const totalCount = currentTest.questions.length;
    const passRate = correctCount / totalCount;
    
    // 在记录结果前同步复习卡
    syncCarryOverMistakesAfterTest();
    
    const testType = learningProgress.currentTestType;
    const theme = learningProgress.currentTheme;
    const themeData = learningProgress.themes[theme];
    const rules = testRules[userConfig.ability];
    
    // 更新测试结果
    if (testType === 'test1') {
        themeData.test1.attempts++;
        themeData.test1.lastAttempt = new Date().toISOString();
        
        // 记录第一次测试通过率
        if (themeData.test1.attempts === 1) {
            themeData.test1.firstAttemptPassRate = passRate;
        }
        
        themeData.test1.passRate = passRate;
        
        // 判断是否通过
        if (passRate >= rules.test1.passRate) {
            themeData.test1.status = 'completed';
            
            // 良好能力：检查是否可以解锁测试2
            if (userConfig.ability === 'good' && rules.test1.unlockTest2) {
                if (themeData.test1.attempts === 1 && passRate >= 0.9) {
                    // 第一次测试≥90%，解锁测试2
                    themeData.test2.unlocked = true;
                    themeData.test2.unlockable = true;
                    themeData.test2.status = 'available';
                    showUnlockNotification(theme, passRate);
                } else if (themeData.test1.attempts === 1 && passRate < 0.9) {
                    // 第一次测试<90%，标记为不可解锁
                    themeData.test2.unlockable = false;
                }
            }
            
            // 优秀能力：直接进入测试2
            if (userConfig.ability === 'excellent') {
                themeData.test2.unlocked = true;
                themeData.test2.status = 'available';
                setTimeout(() => {
                    startTest('test2');
                }, 2000);
                return;
            }
            
            // 检查主题是否完成
            if (checkThemeCompletion(theme)) {
                completeTheme(theme);
            } else {
                // 如果已解锁测试2，显示选项
                if (themeData.test2.unlocked) {
                    showTest2Option(theme);
                } else {
                    // 未解锁，直接进入下一主题
                    completeTheme(theme);
                }
            }
        } else {
            // 未通过，保持available状态以便重试
            themeData.test1.status = 'available';
            showRetryNotification(theme, 'test1', passRate);
        }
    } else if (testType === 'test2') {
        themeData.test2.attempts++;
        themeData.test2.lastAttempt = new Date().toISOString();
        themeData.test2.passRate = passRate;
        
        // 判断是否通过
        if (rules.test2.required && passRate >= rules.test2.passRate) {
            themeData.test2.status = 'completed';
        } else if (!rules.test2.required) {
            // 可选测试，完成即可
            themeData.test2.status = 'completed';
        } else {
            // 未通过，保持available状态以便重试（如果已解锁）
            if (themeData.test2.unlocked) {
                themeData.test2.status = 'available';
            } else {
                themeData.test2.status = 'failed';
            }
            showRetryNotification(theme, 'test2', passRate);
            return;
        }
        
        // 检查主题是否完成
        if (checkThemeCompletion(theme)) {
            completeTheme(theme);
        }
    }
    
    saveLearningProgress();
    
    // 更新顶部栏进度
    updateTopBarProgress();
    
    // 显示测试结果
    showTestResult(testType, passRate, correctCount, totalCount);
}

// 检查主题是否完成
function checkThemeCompletion(theme) {
    const themeData = learningProgress.themes[theme];
    const rules = testRules[userConfig.ability];
    
    // 测试1必须完成
    if (themeData.test1.status !== 'completed') {
        return false;
    }
    
    // 测试2根据规则判断
    if (rules.test2.required) {
        return themeData.test2.status === 'completed';
    }
    
    return true;
}

// 完成主题
function completeTheme(theme) {
    const themeData = learningProgress.themes[theme];
    themeData.status = 'completed';
    
    // 解锁下一个主题
    const themes = themeOrder[userConfig.userType];
    const currentIndex = themes.indexOf(theme);
    if (currentIndex < themes.length - 1) {
        const nextTheme = themes[currentIndex + 1];
        learningProgress.themes[nextTheme].status = 'learning';
        learningProgress.themes[nextTheme].test1.status = 'available';  // 解锁下一个主题的test1
        learningProgress.currentThemeIndex = currentIndex + 1;
        learningProgress.currentTheme = nextTheme;
    }
    
    saveLearningProgress();
    renderThemeNavigation();
    updateTopBarProgress();
    
    // 返回学习模式
    setTimeout(() => {
        switchMode('learning');
    }, 2000);
}

// 显示解锁通知
function showUnlockNotification(theme, passRate) {
    const message = document.getElementById('unlock-message');
    if (message) {
    message.textContent = `你在第一次语义测试中获得了${(passRate * 100).toFixed(0)}%的成绩，已解锁词性测试！`;
    }
    showModal('unlock-modal');
}

// 开始测试2
function startTest2() {
    hideModal('unlock-modal');
    startTest('test2');
}

// 跳过到下一主题
function skipToNextTheme() {
    hideModal('unlock-modal');
    const theme = learningProgress.currentTheme;
    completeTheme(theme);
}

// 显示测试2选项
function showTest2Option(theme) {
    // 可以在这里添加一个选择界面
    // 暂时直接进入测试2
    setTimeout(() => {
        startTest('test2');
    }, 2000);
}

// 显示重试通知
function showRetryNotification(theme, testType, passRate) {
    const message = document.getElementById('retry-message');
    const rules = testRules[userConfig.ability];
    const requiredRate = testType === 'test1' ? rules.test1.passRate : rules.test2.passRate;
    
    if (message) {
    message.textContent = `测试未通过！通过率：${(passRate * 100).toFixed(0)}% < ${(requiredRate * 100).toFixed(0)}%\n请重新学习并测试。`;
    }
    showModal('retry-modal');
}

// 返回学习
function returnToLearning() {
    hideModal('retry-modal');
    switchMode('learning');
}

// 显示测试结果
function showTestResult(testType, passRate, correctCount, totalCount) {
    const container = domCache.cardsContainer || document.getElementById('cards-container');
    const testTypeName = testType === 'test1' ? '语义测试' : '词性测试';
    
    // 收集错误词汇
    const wrongAnswers = [];
    currentTest.questions.forEach((question, index) => {
        const answer = currentTest.answers[index];
        if (answer && !answer.correct) {
            wrongAnswers.push({
                word: question.word.noun,
                meaning: question.word.meaning,
                selected: answer.selectedAnswer,
                correct: question.correctAnswer,
                image: question.word.image,
                category: question.word.category
            });
        }
    });
    
    let wrongWordsHtml = '';
    if (wrongAnswers.length > 0) {
        wrongWordsHtml = `
            <div style="margin-top: 30px; padding: 20px; background: #fff3cd; border-radius: 12px; border: 1px solid #ffc107;">
                <h3 style="color: #856404; margin-bottom: 15px;">
                    <span class="icon">⚠️</span> 错误词汇 (${wrongAnswers.length}个)
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">
                    ${wrongAnswers.map(item => `
                        <div style="padding: 10px; background: white; border-radius: 8px; border: 1px solid #ffc107;">
                            <div style="font-weight: 600; color: #2c3e50;">${item.word}</div>
                            <div style="font-size: 0.9rem; color: #e74c3c; margin-top: 5px;">
                                你选: ${item.selected}
                            </div>
                            <div style="font-size: 0.9rem; color: #27ae60; margin-top: 3px;">
                                正确: ${item.correct}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = `
        <div class="loader" style="text-align: center; padding: 40px;">
            <h2>${testTypeName}完成</h2>
            <p style="font-size: 1.5rem; margin: 20px 0;">
                正确：${correctCount} / ${totalCount}
            </p>
            <p style="font-size: 1.2rem; color: ${passRate >= 0.8 ? '#27ae60' : '#e74c3c'};">
                通过率：${(passRate * 100).toFixed(0)}%
            </p>
            ${wrongWordsHtml}
        </div>
    `;
}

// ==================== 卡片点击事件处理 ====================

// 注意：测试模式下的卡片点击逻辑已整合到 renderTestCard 函数中的卡片点击事件中
// 当从背面翻回正面时，会自动进入下一题，无需额外的全局监听器

// ==================== 初始化函数 ====================

// 页面加载完成后初始化语音
function initSpeech() {
    // 有些浏览器需要在用户交互后才能获取语音列表
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = function() {
            // 语音列表已更新
        };
    }
    
    // 尝试获取语音列表
    window.speechSynthesis.getVoices();
}

// 图片预加载管理器 - 预加载下一主题的图片
const imagePreloader = {
    preloadedThemes: new Set(),
    preload: function(theme) {
        // 如果已经预加载过，跳过
        if (this.preloadedThemes.has(theme)) {
            return;
        }
        
        // 获取该主题的词汇
        const themeWords = vocabulary.filter(item => item.category === theme);
        if (themeWords.length === 0) {
            return;
        }
        
        log(`开始预加载主题 "${theme}" 的图片 (${themeWords.length}张)`);
        
        // 预加载图片（使用Image对象，不添加到DOM）
        themeWords.forEach(item => {
            const img = new Image();
            img.src = getImagePath(item.image, item.category);
            // 可选：添加加载成功/失败的回调
            img.onload = () => {
                log(`预加载成功: ${item.noun}`);
            };
            img.onerror = () => {
                warn(`预加载失败: ${item.noun}`);
            };
        });
        
        // 标记为已预加载
        this.preloadedThemes.add(theme);
        log(`主题 "${theme}" 预加载完成`);
    },
    // 获取下一个主题
    getNextTheme: function() {
        if (!userConfig || !userConfig.userType) {
            return null;
        }
        const themes = themeOrder[userConfig.userType];
        if (!themes || themes.length === 0) {
            return null;
        }
        const currentIndex = themes.indexOf(learningProgress.currentTheme);
        if (currentIndex >= 0 && currentIndex < themes.length - 1) {
            return themes[currentIndex + 1];
        }
        return null;
    },
    // 预加载下一个主题
    preloadNextTheme: function() {
        const nextTheme = this.getNextTheme();
        if (nextTheme) {
            // 延迟预加载，避免影响当前主题的加载
            setTimeout(() => {
                this.preload(nextTheme);
            }, 1000);
        }
    }
};

// 初始化页面
// 进度条已整合到卡片内部，无需监听窗口大小和滚动事件

document.addEventListener('DOMContentLoaded', function() {
    log('=== 页面初始化开始 ===');
    
    initInteractionGuards();
    
    // 初始化DOM缓存（必须在最前面，因为其他函数依赖它）
    domCache.init();
    log('DOM缓存初始化完成');
    
    // 初始化图片懒加载
    imageLazyLoader.init();
    log('图片懒加载初始化完成');
    
    // 检查vocabulary数据
    log('vocabulary数据类型:', typeof vocabulary);
    log('vocabulary是否为数组:', Array.isArray(vocabulary));
    if (Array.isArray(vocabulary)) {
        log('vocabulary数组长度:', vocabulary.length);
    }
    
    // 加载配置（同步执行，因为vocabulary是同步定义的）
    try {
        loadUserConfig();
        loadLearningProgress();
        log('用户配置加载完成:', userConfig);
        log('学习进度加载完成:', learningProgress);
        
        // 如果未完成设置，显示设置弹窗
        if (!userConfig || !userConfig.setupCompleted) {
            log('用户未完成设置，显示设置弹窗');
            showModal('setup-modal');
            if (domCache.fixedTopBar) {
                domCache.fixedTopBar.style.display = 'none';
            }
        } else {
            log('用户已完成设置，显示主界面');
            
            // 检查并修复：如果currentTheme为null，自动设置第一个主题
            if (!learningProgress.currentTheme && userConfig.userType) {
                log('检测到currentTheme为null，自动设置第一个主题');
                const themes = themeOrder[userConfig.userType];
                if (themes && themes.length > 0) {
                    learningProgress.currentTheme = themes[0];
                    learningProgress.currentThemeIndex = 0;
                    // 如果themes对象为空，初始化它
                    if (!learningProgress.themes || Object.keys(learningProgress.themes).length === 0) {
                        initializeLearningProgress();
                    } else {
                        // 只更新currentTheme和currentThemeIndex
                        saveLearningProgress();
                    }
                    log('已自动设置主题为:', learningProgress.currentTheme);
                }
            }
            
            // 已设置，显示主界面
            if (domCache.fixedTopBar) {
                domCache.fixedTopBar.style.display = 'flex';
            }
            updateTopBarProgress();
            
            const initialMode = learningProgress.currentMode || 'learning';
            log('按照上次使用的模式恢复界面:', initialMode);
            switchMode(initialMode);
            log('模式初始化完成');
            
            // 延迟执行，确保卡片已渲染后再更新遮挡层高度
            overlayUpdateScheduler.scheduleDelayed(100);
            log('遮挡层高度已更新');
        }
    } catch (e) {
        error('初始化失败:', e);
        error('错误堆栈:', e.stack);
        // 即使出错也显示设置界面
        showModal('setup-modal');
        if (domCache.fixedTopBar) {
            domCache.fixedTopBar.style.display = 'none';
        }
    }
    
    initSpeech(); // 初始化语音功能
    log('=== 页面初始化完成 ===');
});
