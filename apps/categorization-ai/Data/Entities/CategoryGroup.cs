using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace YnabCategoryAi.Data.Entities;

[Table("category_groups")]
public class CategoryGroup
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = null!;

    [Column("name")]
    public string Name { get; set; } = null!;

    [Column("hidden")]
    public bool Hidden { get; set; }

    [Column("deleted")]
    public bool Deleted { get; set; }

    public ICollection<Category> Categories { get; set; } = [];
}
