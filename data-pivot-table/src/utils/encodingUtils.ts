/**
 * 编码检测工具
 * 自动检测 CSV 文件编码，支持 UTF-8 和 GBK
 */

/**
 * 检测文本是否包含乱码特征
 * 常见的 UTF-8 解码 GBK 文件产生的乱码模式：
 * - 包含 替换字符 (U+FFFD)
 * - 包含连续的高位字符（可能是 GBK 双字节被错误解码）
 */
function hasGarbledText(text: string): boolean {
  // 检查是否有 Unicode 替换字符
  if (text.includes('\uFFFD')) {
    return true;
  }

  // 统计各种字符类型的比例
  let cjkCount = 0; // CJK 汉字（正常中文）
  let highByteCount = 0; // 高位字符（可能是乱码）
  let asciiCount = 0; // ASCII 字符
  const sampleLength = Math.min(text.length, 2000); // 检查前 2000 个字符

  for (let i = 0; i < sampleLength; i++) {
    const code = text.charCodeAt(i);

    if (code < 128) {
      // ASCII 字符
      asciiCount++;
    } else if (code >= 0x4e00 && code <= 0x9fff) {
      // CJK 统一汉字（正常中文）
      cjkCount++;
    } else if (code >= 0x3400 && code <= 0x4dbf) {
      // CJK 扩展 A（正常中文）
      cjkCount++;
    } else if (code >= 0x3000 && code <= 0x303f) {
      // CJK 标点符号（正常）
      cjkCount++;
    } else if (code >= 0xff00 && code <= 0xffef) {
      // 全角字符（正常）
      cjkCount++;
    } else if (code > 0x7f && code < 0x100) {
      // 高位字符（可能是 GBK 被错误解码）
      highByteCount++;
    } else if (code >= 0x100) {
      // 其他 Unicode 字符（可能是乱码）
      // 如果不是常见的中文范围，可能是乱码
      highByteCount++;
    }
  }

  const nonAsciiLength = sampleLength - asciiCount;

  // 如果没有非 ASCII 字符，可能是纯英文文件，不是乱码
  if (nonAsciiLength === 0) {
    return false;
  }

  // 如果高位字符占非 ASCII 字符的比例超过 30%，认为是乱码
  if (nonAsciiLength > 0 && highByteCount / nonAsciiLength > 0.3) {
    return true;
  }

  // 如果有大量高位字符但没有 CJK 字符，可能是乱码
  if (highByteCount > 10 && cjkCount === 0) {
    return true;
  }

  return false;
}

/**
 * 读取文件文本内容，自动检测编码
 * 优先尝试 UTF-8，如果检测到乱码则回退到 GBK
 */
export async function readFileWithAutoEncoding(file: File): Promise<string> {
  // 先尝试 UTF-8
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // 检查 UTF-8 BOM
  const hasUTF8BOM = uint8Array[0] === 0xef && uint8Array[1] === 0xbb && uint8Array[2] === 0xbf;

  if (hasUTF8BOM) {
    // 有 UTF-8 BOM，直接用 UTF-8 解码
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(uint8Array);
  }

  // 尝试 UTF-8 解码
  const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
  const utf8Text = utf8Decoder.decode(uint8Array);

  // 检查是否有乱码
  if (!hasGarbledText(utf8Text)) {
    return utf8Text;
  }

  // 检测到乱码，尝试 GBK
  try {
    const gbkDecoder = new TextDecoder('gbk', { fatal: false });
    const gbkText = gbkDecoder.decode(uint8Array);

    // 验证 GBK 解码结果是否更好
    if (!hasGarbledText(gbkText)) {
      return gbkText;
    }
  } catch {
    // GBK 解码失败，继续使用 UTF-8
  }

  // 如果 GBK 也失败，返回 UTF-8 结果
  return utf8Text;
}

/**
 * 读取文件文本内容（同步版本，用于 FileReader）
 * 用于兼容现有的 FileReader API
 */
export function readAsTextWithAutoEncoding(
  file: File,
  callback: (text: string) => void,
  errorCallback?: (error: Error) => void
): void {
  const reader = new FileReader();

  reader.onload = async (e) => {
    try {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      const uint8Array = new Uint8Array(arrayBuffer);

      // 检查 UTF-8 BOM
      const hasUTF8BOM = uint8Array[0] === 0xef && uint8Array[1] === 0xbb && uint8Array[2] === 0xbf;

      if (hasUTF8BOM) {
        const decoder = new TextDecoder('utf-8');
        callback(decoder.decode(uint8Array));
        return;
      }

      // 尝试 UTF-8 解码
      const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
      const utf8Text = utf8Decoder.decode(uint8Array);

      if (!hasGarbledText(utf8Text)) {
        callback(utf8Text);
        return;
      }

      // 尝试 GBK
      try {
        const gbkDecoder = new TextDecoder('gbk', { fatal: false });
        const gbkText = gbkDecoder.decode(uint8Array);

        if (!hasGarbledText(gbkText)) {
          callback(gbkText);
          return;
        }
      } catch {
        // GBK 解码失败
      }

      // 回退到 UTF-8
      callback(utf8Text);
    } catch (error) {
      if (errorCallback) {
        errorCallback(error instanceof Error ? error : new Error('文件读取失败'));
      }
    }
  };

  reader.onerror = () => {
    if (errorCallback) {
      errorCallback(new Error('文件读取失败'));
    }
  };

  reader.readAsArrayBuffer(file);
}
