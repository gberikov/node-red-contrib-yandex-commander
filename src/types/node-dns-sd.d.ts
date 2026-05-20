declare module 'node-dns-sd' {
  interface DiscoverOptions {
    name: string;
    wait?: number;
    quick?: boolean;
  }

  /** Сырая структура rdata для разных типов DNS-записей. Для SRV содержит target,
   *  для TXT — произвольный набор key=value пар. */
  type DnsRdata = { target?: string; [key: string]: unknown };

  interface DnsRecord {
    type: string;
    rdata: DnsRdata;
  }

  interface DiscoverResult {
    address: string;
    service: { port: number; [key: string]: unknown };
    packet: {
      answers: DnsRecord[];
      additionals: DnsRecord[];
    };
    [key: string]: unknown;
  }

  interface MDnsSd {
    discover(options: DiscoverOptions): Promise<DiscoverResult[]>;
  }

  const mDnsSd: MDnsSd;
  export default mDnsSd;
}
