using Microsoft.EntityFrameworkCore;
using YnabCategoryAi.Data.Entities;

namespace YnabCategoryAi.Data;

public class BudgetToolsContext(DbContextOptions<BudgetToolsContext> options) : DbContext(options)
{
    public DbSet<Transaction> Transactions { get; set; }
    public DbSet<Category> Categories { get; set; }
    public DbSet<CategoryGroup> CategoryGroups { get; set; }
    public DbSet<CategorizationFeedback> CategorizationFeedback { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Transaction>(entity =>
        {
            entity.Property(t => t.Subtransactions)
                .HasColumnType("jsonb")
                .HasDefaultValueSql("'[]'::jsonb");

            entity.Property(t => t.Meta)
                .HasColumnType("jsonb")
                .HasDefaultValueSql("'{}'::jsonb");

            entity.HasOne(t => t.Category)
                .WithMany()
                .HasForeignKey(t => t.CategoryId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<CategoryGroup>(entity =>
        {
            entity.HasMany(g => g.Categories)
                .WithOne(c => c.Group)
                .HasForeignKey(c => c.CategoryGroupId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<CategorizationFeedback>(entity =>
        {
            entity.Property(f => f.ProposalSnapshot)
                .HasColumnType("jsonb")
                .HasDefaultValueSql("'{}'::jsonb");

            entity.HasIndex(f => f.TransactionId);
            entity.HasIndex(f => f.CreatedAt);
        });
    }
}
