declare module 'node-dns-sd' {
  interface DiscoverOptions {
    name: string;
    wait?: number;
    quick?: boolean;
  }

  interface DnsRecord {
    type: string;
    rdata: any;
  }

  interface DiscoverResult {
    address: string;
    service: { port: number; [key: string]: any };
    packet: {
      answers: DnsRecord[];
      additionals: DnsRecord[];
    };
    [key: string]: any;
  }

  interface MDnsSd {
    discover(options: DiscoverOptions): Promise<DiscoverResult[]>;
  }

  const mDnsSd: MDnsSd;
  export default mDnsSd;
}
