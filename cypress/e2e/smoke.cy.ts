describe("SmartSend Dashboard Smoke", () => {
  it("shows queue and replied counts", () => {
    cy.visit("/dashboard");
    cy.findByText(/Queue/i).should("exist");
    cy.findByText(/Replied/i).should("exist");
  });
});

