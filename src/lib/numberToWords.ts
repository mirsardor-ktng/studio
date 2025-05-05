// src/lib/numberToWords.ts

const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const thousands = ['', 'thousand', 'million', 'billion', 'trillion']; // Add more if needed

/**
 * Converts a number less than 1000 into words.
 * @param num The number (0-999).
 * @returns The number in words.
 */
function convertLessThanOneThousand(num: number): string {
  if (num === 0) {
    return '';
  }

  let words = '';

  if (num >= 100) {
    words += ones[Math.floor(num / 100)] + ' hundred';
    num %= 100;
    if (num > 0) {
      words += ' ';
    }
  }

  if (num >= 20) {
    words += tens[Math.floor(num / 10)];
    num %= 10;
    if (num > 0) {
      words += '-' + ones[num];
    }
  } else if (num >= 10) {
    words += teens[num - 10];
    num = 0; // Handled by teens
  } else if (num > 0) {
    words += ones[num];
    num = 0; // Handled by ones
  }

  return words;
}

/**
 * Converts a non-negative number into words.
 * Handles integers and decimals up to two places (cents).
 * @param num The number to convert.
 * @returns The number in words, including currency handling.
 */
export function numberToWords(num: number): string {
  if (num === 0) {
    return 'zero';
  }
  if (num < 0) {
    return 'minus ' + numberToWords(Math.abs(num));
  }

  let integerPart = Math.floor(num);
  let decimalPart = Math.round((num - integerPart) * 100); // Get cents

  let integerWords = '';
  let i = 0;

  if (integerPart === 0 && decimalPart > 0) {
     // Handle cases like 0.50 -> "fifty cents"
  } else {
    do {
      const chunk = integerPart % 1000;
      if (chunk !== 0) {
        integerWords = convertLessThanOneThousand(chunk) + (thousands[i] ? ' ' + thousands[i] : '') + (integerWords ? ' ' + integerWords : '');
      }
      integerPart = Math.floor(integerPart / 1000);
      i++;
    } while (integerPart > 0);
  }


  let decimalWords = '';
  if (decimalPart > 0) {
    decimalWords = ' and ' + convertLessThanOneThousand(decimalPart) + ' cents';
     // Special case for singular cent
      if (decimalPart === 1) {
          decimalWords = ' and one cent';
      }
  } else {
    // If there's an integer part but no decimal part, add "dollars" or similar if needed by context,
    // but for general conversion, just return the integer words.
     // decimalWords = ' dollars'; // Example if currency context is always assumed
  }

  // Combine integer and decimal parts
  // Trim any leading/trailing whitespace
  const finalWords = (integerWords + decimalWords).trim();

  // Capitalize first letter
  return finalWords.charAt(0).toUpperCase() + finalWords.slice(1);
}
