# rate_limits

Fixed-window per-IP limits in Redis: uploads per hour, fetches per minute (`RATE_LIMITS_`).

- Keyed on `abuse_subject_of_ip(get_client_ip_address(request))` (`app/shared/addresses.py`): the TCP peer, or the proxy's header only from a peer in `PROXY_TRUSTED_CIDRS`; IPv6 counts per /64.
- `store.py` sets the window with `SET NX EX` and counts with `INCR` in one pipeline; `PTTL` gives `Retry-After`.
