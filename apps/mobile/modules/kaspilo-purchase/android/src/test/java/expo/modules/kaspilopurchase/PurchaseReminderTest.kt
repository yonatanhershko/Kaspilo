package expo.modules.kaspilopurchase

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PurchaseReminderTest {
  private fun amount(text: String) = PurchaseReminder.findAmount(text)

  @Test
  fun readsAmountsWithACurrencySign() {
    assertEquals(PurchaseReminder.Amount(4590, "ILS", false), amount("₪45.90 with Visa •••• 1234"))
    assertEquals(PurchaseReminder.Amount(4590, "ILS", false), amount("‏45.90 ₪ באמצעות Visa"))
    assertEquals(PurchaseReminder.Amount(123456, "USD", false), amount("Paid $1,234.56."))
    assertEquals(PurchaseReminder.Amount(750, "EUR", false), amount("€7,5 at Café"))
    assertEquals("OTHER", amount("CA$12.00")?.currency)
    assertTrue(amount("Refund -₪20.00")!!.refund)
    assertEquals(false, amount("Super-Pharm - ₪45")!!.refund)
  }

  @Test
  fun ignoresNumbersWithoutACurrencySign() {
    assertNull(amount("Visa •••• 1234"))
    assertNull(amount("Your card was added"))
    assertNull(amount("₪0.00"))
  }

  @Test
  fun formatsLikeTheApp() {
    assertEquals("₪ 1,850", PurchaseReminder.display(185000, "ILS").replace("‎", ""))
    assertEquals("$ 12.50", PurchaseReminder.display(1250, "USD").replace("‎", ""))
  }

  @Test
  fun cleansMerchant() {
    assertEquals("Super Pharm", PurchaseReminder.cleanMerchant("  Super\n\tPharm "))
    assertEquals(100, PurchaseReminder.cleanMerchant("x".repeat(300)).length)
  }
}
