-- <nowiki>
return {
    ["en"] = {
        ["error-value-func"] = "bad value assigned to option \"valueFunc\" (function expected, got $1)",
        ["error-overwrite-permission"] = "could not write to argument table key \"$1\"; overwriting existing arguments is not permitted",
        ["error-write-permission"] = "could not write to argument table key \"$1\"; the table is read-only"
    },
    ["qqq"] = {
        ["error-value-func"] = "Error thrown when options.valueFunc is not a function",
        ["error-overwrite-permission"] = "Error thrown after write attempt to existing arguments when options.noOverwrite is true",
        ["error-write-permission"] = "Error thrown after write attempt to arguments when options.readOnly is true"
    },
    ["bn"] = {
        ["error-value-func"] = "\"valueFunc\" কে খারাপ ভ্যালু দেয়া হয়েছে। (fফাঙ্কশনের অপক্ষা করতে $1 পেয়েছে)",
        ["error-overwrite-permission"] = "আর্গুমেন্ট টেবিল কী \"$1\" কে লিখতে পারেনি ; আগের থেকে থাকা আর্গুমেন্ট কে ওভাররাইট করার অনুমতি নাই",
        ["error-write-permission"] = "আর্গুমেন্ট টেবিল কী \"$1\" কে ওভাররাইট করতে পৰ যায়নি; এই টেবিলটি রিড-অনলি"
    },
    ["de"] = {
        ["error-value-func"] = "der Option „valueFunc“ wurde ein falscher Wert zugewiesen (Funktion erwartet, erhielt $1)",
        ["error-overwrite-permission"] = "konnte nicht in den Argument Tabellenschlüssel „$1“ schreiben; das Überschreiben vorhandener Argumente ist nicht erlaubt",
        ["error-write-permission"] = "konnte nicht in das Argument Tabellenschlüssel „$1“ schreiben; die Tabelle ist schreibgeschützt"
    },
    ["fr"] = {
        ["error-value-func"] = "valeur invalide assignée à une option \"valueFunc\" (fonction espérée, donne $1)",
        ["error-overwrite-permission"] = "impossible d'écrire dans la clé du tableau des arguments \"$1\"; l'écrasement des arguments existants n'est pas autorisé",
        ["error-write-permission"] = "impossible d'écrire dans la clé du tableau des arguments \"$1\"; le tableau est en mode lecture-seule"
    },
    ["hi"] = {
        ["error-value-func"] = "\"valueFunc\" फंक्शन को बुरा वैल्यू निर्धारित किया गया है (फंक्शन की अपेक्षा की, $1 पाया)",
        ["error-overwrite-permission"] = "तर्क टेबल की \"$1\" पर ओवर्राइट नहीं किया जा सका; मौजूदा तर्कों को ओवर्राइट करने की अनुमति नहीं है",
        ["error-write-permission"] = "तर्क टेबल की \"$1\" पर ओवर्राइट नहीं किया जा सका; टेबल केवल पठन के लिए है"
    },
    ["ru"] = {
        ["error-value-func"] = "параметру \"valueFunc\" присвоено неверное значение (ожидается функция, предоставлено $1)",
        ["error-overwrite-permission"] = "невозможно записать аргумент \"$1\": перезаписывать существующие аргументы запрещено",
        ["error-write-permission"] = "невозможно записать аргумент \"$1\": таблица находится в режиме \"только чтение\""
    },
    ["tr"] = {
        ["error-value-func"] = "\"valueFunc\" seçeneğine atanan hatalı değer (işlev beklendi, $1 alındı)",
        ["error-overwrite-permission"] = "\"$1\" bağımsız değişken tablosu anahtarına yazılamadı; mevcut bağımsız değişkenlerin üzerine yazılmasına izin verilmez",
        ["error-write-permission"] = "\"$1\" bağımsız değişken tablosu anahtarına yazılamadı; tablo salt okunurdur"
    }
}