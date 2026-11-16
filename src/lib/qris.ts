export interface ParsedQris {
  valid: boolean;
  kind: "QRIS" | "PROFILE";
  isDynamic: boolean;
  nmid: string;
  merchantName: string;
  merchantCity: string;
  amount: number | null;
  currency: string;
  crcValid: boolean;
  profilePhone?: string;
  rawPayload: string;
}

export function crc16CcittFalse(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function tlv(tag: string, value: string): string {
  const len = String(value.length).padStart(2, "0");
  return `${tag}${len}${value}`;
}

function parseTlvMap(payload: string): Map<string, string> {
  const map = new Map<string, string>();
  let idx = 0;
  while (idx + 4 <= payload.length) {
    const tag = payload.slice(idx, idx + 2);
    const lenStr = payload.slice(idx + 2, idx + 4);
    const len = Number(lenStr);
    if (!Number.isInteger(len) || len < 0 || idx + 4 + len > payload.length) {
      break;
    }
    const val = payload.slice(idx + 4, idx + 4 + len);
    map.set(tag, val);
    idx += 4 + len;
  }
  return map;
}

export function buildQrisPayload(params: {
  nmid: string;
  merchantName: string;
  merchantCity: string;
  amount?: number | null;
  isDynamic?: boolean;
  mcc?: string;
}): string {
  const isDynamic = Boolean(params.isDynamic ?? (params.amount && params.amount > 0));
  const merchantAccountInfo = [
    tlv("00", "ID.CO.SAKUKILAT.WWW"),
    tlv("01", params.nmid.slice(0, 24)),
    tlv("03", "UMI"),
  ].join("");

  const parts = [
    tlv("00", "01"),
    tlv("01", isDynamic ? "12" : "11"),
    tlv("26", merchantAccountInfo),
    tlv("52", params.mcc || "5814"),
    tlv("53", "360"),
  ];

  if (isDynamic && params.amount && params.amount > 0) {
    parts.push(tlv("54", String(Math.round(params.amount))));
  }

  parts.push(tlv("58", "ID"));
  parts.push(tlv("59", params.merchantName.slice(0, 25)));
  parts.push(tlv("60", params.merchantCity.slice(0, 15)));
  parts.push(tlv("62", tlv("07", "SK01")));

  const bodyWithCrcPrefix = `${parts.join("")}6304`;
  const crc = crc16CcittFalse(bodyWithCrcPrefix);
  return `${bodyWithCrcPrefix}${crc}`;
}

export function parseQrisPayload(raw: string): ParsedQris {
  const trimmed = raw.trim();

  if (trimmed.startsWith("SAKUKILAT:USER:")) {
    const phone = trimmed.replace("SAKUKILAT:USER:", "").trim();
    return {
      valid: phone.length >= 9,
      kind: "PROFILE",
      isDynamic: false,
      nmid: "PROFILE",
      merchantName: "Profil SakuKilat",
      merchantCity: "Indonesia",
      amount: null,
      currency: "IDR",
      crcValid: true,
      profilePhone: phone,
      rawPayload: trimmed,
    };
  }

  const tags = parseTlvMap(trimmed);
  const formatVersion = tags.get("00");
  const poiMethod = tags.get("01");
  const merchantName = tags.get("59");
  const merchantCity = tags.get("60");
  const currency = tags.get("53");
  const crcTag = tags.get("63");

  if (!formatVersion || !merchantName || !crcTag || trimmed.length < 24) {
    return {
      valid: false,
      kind: "QRIS",
      isDynamic: false,
      nmid: "",
      merchantName: "",
      merchantCity: "",
      amount: null,
      currency: "IDR",
      crcValid: false,
      rawPayload: trimmed,
    };
  }

  const crcIdx = trimmed.lastIndexOf("6304");
  const expectedCrc =
    crcIdx >= 0 ? crc16CcittFalse(trimmed.slice(0, crcIdx + 4)) : "";
  const crcValid = crcIdx >= 0 && crcTag.toUpperCase() === expectedCrc;

  let nmid = "ID1026000000001";
  for (const tagKey of ["26", "27", "51"]) {
    const subRaw = tags.get(tagKey);
    if (subRaw) {
      const subMap = parseTlvMap(subRaw);
      const foundId = subMap.get("01") || subMap.get("02");
      if (foundId) {
        nmid = foundId;
        break;
      }
    }
  }

  const rawAmount = tags.get("54");
  const parsedAmount = rawAmount ? Number(rawAmount) : null;
  const amount =
    parsedAmount !== null && Number.isFinite(parsedAmount) && parsedAmount > 0
      ? parsedAmount
      : null;

  return {
    valid: formatVersion === "01" && crcValid,
    kind: "QRIS",
    isDynamic: poiMethod === "12" || amount !== null,
    nmid,
    merchantName,
    merchantCity: merchantCity || "Indonesia",
    amount,
    currency: currency === "360" ? "IDR" : currency || "IDR",
    crcValid,
    rawPayload: trimmed,
  };
}

