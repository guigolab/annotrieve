import asyncio

import pytest

from jobs.services import assembly as asm

pytestmark = pytest.mark.unit


def test_timeout_is_not_a_short_total_cap():
    t = asm._report_timeout()
    assert t.total >= 600  # large reports (tens of MB) must be able to finish
    assert t.sock_read and t.sock_read <= 120  # but a stalled connection is still detected
    assert t.sock_connect and t.sock_connect <= 30


def test_timeout_failures_have_a_readable_message():
    class Session:
        def get(self, *a, **k):
            raise asyncio.TimeoutError()

    res = asyncio.run(asm.get_assembly_report_result(Session(), "https://x/y_assembly_report.txt"))
    assert res.outcome == asm.FetchOutcome.TRANSIENT and res.message == "TimeoutError"
