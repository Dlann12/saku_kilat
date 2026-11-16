<?php

declare(strict_types=1);

namespace App\Services;

use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;

final class QrisService
{
    public function crc16CcittFalse(string $input): string
    {
        $crc = 0xFFFF;
        $len = strlen($input);
        for ($i = 0; $i < $len; $i++) {
            $crc ^= ord($input[$i]) << 8;
            for ($j = 0; $j < 8; $j++) {
                if (($crc & 0x8000) !== 0) {
                    $crc = (($crc << 1) ^ 0x1021) & 0xFFFF;
                } else {
                    $crc = ($crc << 1) & 0xFFFF;
                }
            }
        }

        return strtoupper(str_pad(dechex($crc), 4, '0', STR_PAD_LEFT));
    }

    public function buildQrisPayload(
        string $nmid,
        string $merchantName,
        string $merchantCity,
        ?int $amount = null,
        bool $isDynamic = false,
        string $mcc = '5814',
    ): string {
        $dynamic = $isDynamic || ($amount !== null && $amount > 0);
        $merchantAccountInfo =
            $this->tlv('00', 'ID.CO.SAKUKILAT.WWW')
            .$this->tlv('01', substr($nmid, 0, 24))
            .$this->tlv('03', 'UMI');

        $parts = [
            $this->tlv('00', '01'),
            $this->tlv('01', $dynamic ? '12' : '11'),
            $this->tlv('26', $merchantAccountInfo),
            $this->tlv('52', $mcc),
            $this->tlv('53', '360'),
        ];

        if ($dynamic && $amount !== null && $amount > 0) {
            $parts[] = $this->tlv('54', (string) $amount);
        }

        $parts[] = $this->tlv('58', 'ID');
        $parts[] = $this->tlv('59', substr($merchantName, 0, 25));
        $parts[] = $this->tlv('60', substr($merchantCity, 0, 15));
        $parts[] = $this->tlv('62', $this->tlv('07', 'SK01'));

        $prefix = implode('', $parts).'6304';

        return $prefix.$this->crc16CcittFalse($prefix);
    }

    /**
     * @return array{
     *   valid: bool,
     *   kind: 'QRIS'|'PROFILE',
     *   is_dynamic: bool,
     *   nmid: string,
     *   merchant_name: string,
     *   merchant_city: string,
     *   amount: int|null,
     *   currency: string,
     *   crc_valid: bool,
     *   profile_phone?: string,
     *   raw_payload: string
     * }
     */
    public function parseQrisPayload(string $raw): array
    {
        $trimmed = trim($raw);
        if (str_starts_with($trimmed, 'SAKUKILAT:USER:')) {
            $phone = trim(substr($trimmed, strlen('SAKUKILAT:USER:')));

            return [
                'valid' => strlen($phone) >= 9,
                'kind' => 'PROFILE',
                'is_dynamic' => false,
                'nmid' => 'PROFILE',
                'merchant_name' => 'Profil SakuKilat',
                'merchant_city' => 'Indonesia',
                'amount' => null,
                'currency' => 'IDR',
                'crc_valid' => true,
                'profile_phone' => $phone,
                'raw_payload' => $trimmed,
            ];
        }

        $tags = $this->parseTlvMap($trimmed);
        $formatVersion = $tags['00'] ?? null;
        $poiMethod = $tags['01'] ?? null;
        $merchantName = $tags['59'] ?? null;
        $merchantCity = $tags['60'] ?? 'Indonesia';
        $currency = $tags['53'] ?? '360';
        $crcTag = $tags['63'] ?? null;

        if (! $formatVersion || ! $merchantName || ! $crcTag || strlen($trimmed) < 24) {
            return [
                'valid' => false,
                'kind' => 'QRIS',
                'is_dynamic' => false,
                'nmid' => '',
                'merchant_name' => '',
                'merchant_city' => '',
                'amount' => null,
                'currency' => 'IDR',
                'crc_valid' => false,
                'raw_payload' => $trimmed,
            ];
        }

        $crcPos = strrpos($trimmed, '6304');
        $expectedCrc = $crcPos !== false ? $this->crc16CcittFalse(substr($trimmed, 0, $crcPos + 4)) : '';
        $crcValid = $crcPos !== false && strtoupper($crcTag) === $expectedCrc;

        $nmid = 'ID1026000000001';
        foreach (['26', '27', '51'] as $tagKey) {
            if (isset($tags[$tagKey])) {
                $sub = $this->parseTlvMap($tags[$tagKey]);
                if (! empty($sub['01'])) {
                    $nmid = $sub['01'];
                    break;
                }
                if (! empty($sub['02'])) {
                    $nmid = $sub['02'];
                    break;
                }
            }
        }

        $amount = isset($tags['54']) && is_numeric($tags['54']) && (int) $tags['54'] > 0
            ? (int) $tags['54']
            : null;

        return [
            'valid' => $formatVersion === '01' && $crcValid,
            'kind' => 'QRIS',
            'is_dynamic' => $poiMethod === '12' || $amount !== null,
            'nmid' => $nmid,
            'merchant_name' => $merchantName,
            'merchant_city' => $merchantCity,
            'amount' => $amount,
            'currency' => $currency === '360' ? 'IDR' : $currency,
            'crc_valid' => $crcValid,
            'raw_payload' => $trimmed,
        ];
    }

    public function renderSvg(string $payload, int $size = 180): string
    {
        $renderer = new ImageRenderer(
            new RendererStyle($size, 1),
            new SvgImageBackEnd
        );
        $writer = new Writer($renderer);

        return $writer->writeString($payload);
    }

    private function tlv(string $tag, string $value): string
    {
        $len = str_pad((string) strlen($value), 2, '0', STR_PAD_LEFT);

        return "{$tag}{$len}{$value}";
    }

    /**
     * @return array<string, string>
     */
    private function parseTlvMap(string $payload): array
    {
        $map = [];
        $idx = 0;
        $total = strlen($payload);
        while ($idx + 4 <= $total) {
            $tag = substr($payload, $idx, 2);
            $lenStr = substr($payload, $idx + 2, 2);
            if (! ctype_digit($lenStr)) {
                break;
            }
            $len = (int) $lenStr;
            if ($idx + 4 + $len > $total) {
                break;
            }
            $map[$tag] = substr($payload, $idx + 4, $len);
            $idx += 4 + $len;
        }

        return $map;
    }
}
