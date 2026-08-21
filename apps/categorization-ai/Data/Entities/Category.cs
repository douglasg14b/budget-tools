using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace YnabCategoryAi.Data.Entities;

[Table("categories")]
public class Category
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = null!;

    [Column("category_group_id")]
    public string CategoryGroupId { get; set; } = null!;

    [Column("name")]
    public string Name { get; set; } = null!;

    [Column("hidden")]
    public bool Hidden { get; set; }

    [Column("deleted")]
    public bool Deleted { get; set; }

    [Column("note")]
    public string? Note { get; set; }

    public CategoryGroup Group { get; set; } = null!;
}
