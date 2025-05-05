// src/lib/numberToWords.ts

const onesRu = [
  '', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'
];
const onesRuFeminine = [ // For thousands (тысяча)
    '', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'
];
const teensRu = [
  'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать',
  'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'
];
const tensRu = [
  '', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят',
  'восемьдесят', 'девяносто'
];
const hundredsRu = [
  '', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот',
  'восемьсот', 'девятьсот'
];
const thousandsRu = ['', 'тысяча', 'миллион', 'миллиард', 'триллион']; // Cases handled separately

/**
 * Helper function to get the correct Russian/Uzbek noun declension based on the number.
 * @param num The number.
 * @param one Form for 1 (e.g., 'сум').
 * @param two Form for 2-4 (e.g., 'сума').
 * @param five Form for 5-9, 0, 11-19 (e.g., 'сумов').
 * @returns The correctly declined noun.
 */
function getRussianNounDeclension(num: number, one: string, two: string, five: string): string {
  num = Math.abs(num) % 100; // Handle numbers > 100
  const lastDigit = num % 10;

  if (num > 10 && num < 20) { // 11-19 use the 'five' form
    return five;
  }
  if (lastDigit === 1) { // Ends in 1 (but not 11)
    return one;
  }
  if (lastDigit >= 2 && lastDigit <= 4) { // Ends in 2, 3, 4 (but not 12, 13, 14)
    return two;
  }
  // Ends in 0, 5-9 or 11-19
  return five;
}

/**
 * Converts a number less than 1000 into Russian words.
 * @param num The number (0-999).
 * @param useFeminineOnes Whether to use feminine forms for 1 and 2 (for thousands).
 * @returns The number in words (Russian).
 */
function convertLessThanOneThousandRu(num: number, useFeminineOnes = false): string {
    if (num === 0) {
        return '';
    }

    let words = '';
    const currentOnes = useFeminineOnes ? onesRuFeminine : onesRu;

    // Hundreds
    if (num >= 100) {
        words += hundredsRu[Math.floor(num / 100)];
        num %= 100;
        if (num > 0) {
            words += ' ';
        }
    }

    // Tens and Ones
    if (num >= 20) {
        words += tensRu[Math.floor(num / 10)];
        num %= 10;
        if (num > 0) {
            words += ' ' + currentOnes[num];
        }
    } else if (num >= 10) {
        words += teensRu[num - 10];
        num = 0; // Handled by teens
    } else if (num > 0) {
        words += currentOnes[num];
        num = 0; // Handled by ones
    }

    return words;
}


/**
 * Converts a non-negative number into Russian words, specifically formatted for Uzbekistan Sum currency (sum and tiyin).
 * Handles integers and decimals up to two places.
 * @param num The number to convert.
 * @returns The number in Russian words with currency.
 */
export function numberToWords(num: number): string {
    if (num === 0) {
        return 'Ноль сумов 00 тийинов'; // Changed currency
    }
    if (num < 0) {
        // Handle negative if necessary, though context implies positive amounts
         return 'Минус ' + numberToWords(Math.abs(num));
    }
    if (isNaN(num)) {
        return ''; // Return empty string for invalid input
    }


    let integerPart = Math.floor(num);
    let decimalPart = Math.round((num - integerPart) * 100);

    // Handle potential rounding issues leading to 100 kopecks/tiyins
    if (decimalPart === 100) {
        integerPart += 1;
        decimalPart = 0;
    }


    let integerWords = '';
    let i = 0; // Index for thousands, millions, etc.

    if (integerPart === 0) {
        integerWords = 'ноль';
    } else {
        do {
            const chunk = integerPart % 1000;
            if (chunk !== 0) {
                const useFeminine = i === 1; // Use feminine for 'тысяча'
                const chunkWords = convertLessThanOneThousandRu(chunk, useFeminine);
                let thousandWord = '';
                if (i > 0) {
                    // Get declension for thousand, million, etc.
                    thousandWord = getRussianNounDeclension(chunk, thousandsRu[i], thousandsRu[i] === 'тысяча' ? 'тысячи' : thousandsRu[i]+'а', thousandsRu[i] === 'тысяча' ? 'тысяч' : thousandsRu[i]+'ов');
                    // Handle special case for 'тысяча' itself when chunk is 1
                    if (i === 1 && chunk === 1) {
                         thousandWord = 'тысяча'; // 'одна' is already generated
                    } else if (i > 0) {
                        thousandWord = ' ' + thousandWord;
                    }
                }

                integerWords = chunkWords + thousandWord + (integerWords ? ' ' + integerWords : '');
            }
            integerPart = Math.floor(integerPart / 1000);
            i++;
        } while (integerPart > 0);
    }

    const sumDeclension = getRussianNounDeclension(Math.floor(num), 'сум', 'сума', 'сумов'); // Changed currency

     // Format decimal part always with two digits
    const decimalFormatted = decimalPart.toString().padStart(2, '0');
    const tiyinDeclension = getRussianNounDeclension(decimalPart, 'тийин', 'тийина', 'тийинов'); // Changed currency

    // Combine parts
    const finalWords = `${integerWords.trim()} ${sumDeclension} ${decimalFormatted} ${tiyinDeclension}`;

    // Capitalize first letter
    return finalWords.charAt(0).toUpperCase() + finalWords.slice(1);
}
